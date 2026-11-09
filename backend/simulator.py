"""Stand-in for the AI pipeline on the smart pole.

It sends exactly what the real pipeline sends (same endpoints, same X-API-Key):
  - annotated video frames for each of the 4 cameras  -> live view in the web app
  - a count event each time a tracked person crosses the virtual line
  - a face embedding + face crop + full frame for each person approaching the camera;
    the server matches the embedding against the watchlist and raises alerts

Run while the server is up:
  python simulator.py                 4 drawn camera scenes
  python simulator.py --webcam        CAM 1 uses your webcam with real face detection (OpenCV)
  python simulator.py --webcam --webcam-as 4
                                      faces seen by the webcam are treated as watchlist person 4
                                      (demo only: there is no real recognition model here)
"""
import argparse
import base64
import random
import shutil
import tempfile
import threading
import time
from pathlib import Path

import httpx

from app.config import PIPELINE_API_KEY
from app.fakevec import noisy, person_vector, random_face
from demo.scene import H, LINE_Y, W, Look, Walker, render_frame, render_portrait, to_jpeg

CAMERAS = [(1, "CAM 1", "in"), (2, "CAM 2", "in"), (3, "CAM 3", "out")]
b64 = lambda data: base64.b64encode(data).decode()


class Pipeline:
    def __init__(self, url: str):
        self.http = httpx.Client(base_url=url, headers={"X-API-Key": PIPELINE_API_KEY}, timeout=10)

    def frame(self, cam: int, jpeg: bytes):
        self.http.post(f"/api/ingest/frame/{cam}", content=jpeg, headers={"Content-Type": "image/jpeg"})

    def heartbeat(self, cam: int):
        self.http.post("/api/ingest/heartbeat", json={"camera_id": cam})

    def count(self, cam: int, direction: str, track: str) -> dict:
        return self.http.post("/api/ingest/count", json={"camera_id": cam, "direction": direction, "track_id": track}).json()

    def face(self, cam: int, track: str, emb, face_jpeg: bytes, frame_jpeg: bytes) -> dict:
        return self.http.post("/api/ingest/face", json={"camera_id": cam, "track_id": track, "embedding": emb,
                                                        "snapshot_b64": b64(face_jpeg), "frame_b64": b64(frame_jpeg)}).json()


def log(msg: str):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def apply_result(w: Walker, res: dict, names: dict):
    if res.get("matched"):
        pid = res["person_id"]
        w.status = names[pid]["category"]
        w.label = f"{w.status.upper()} {res['similarity']:.2f}"
        if res.get("alert"):
            a = res["alert"]
            log(f"[แจ้งเตือน] {a['camera']['camera_name']} {w.status.upper()} {a['person']['full_name']} ความคล้าย {res['similarity']}")


class DrawnCamera(threading.Thread):
    """A drawn scene: people walk toward the camera and cross the virtual line."""

    def __init__(self, cam, url, watchlist, fps, busy, stop):
        super().__init__(daemon=True)
        self.cam_id, self.name, self.direction = cam
        self.api = Pipeline(url)
        self.watchlist = watchlist
        self.names = {p["person_id"]: p for p in watchlist}
        self.fps, self.busy, self.stop = fps, busy, stop
        self.rng = random.Random(self.cam_id * 7919 + int(time.time()))
        self.walkers: list[Walker] = []
        self.track = 0
        self.counted = 0

    def spawn(self):
        self.track += 1
        w = Walker(self.track, Look.random(self.rng), self.rng.uniform(0.2, 0.8),
                   speed=self.rng.uniform(0.004, 0.007), drift=self.rng.uniform(-0.0015, 0.0015))
        if self.watchlist and self.rng.random() < 0.15:
            p = self.rng.choice(self.watchlist)
            w.person_id, w.look = p["person_id"], Look.for_person(p["person_id"])
        self.walkers.append(w)

    def counts(self):
        return (self.counted, 0) if self.direction == "in" else (0, self.counted)

    def run(self):
        last_beat = 0
        while not self.stop.is_set():
            t0 = time.time()
            try:
                if len(self.walkers) < 4 and self.rng.random() < self.busy / self.fps:
                    self.spawn()
                for w in list(self.walkers):
                    before = 80 + w.progress * (H - 40)
                    w.step()
                    after = 80 + w.progress * (H - 40)
                    if not w.counted and before < LINE_Y <= after:
                        w.counted = True
                        self.counted += 1
                        self.api.count(self.cam_id, self.direction, f"C{self.cam_id}-{w.track_id}")
                    if not w.face_sent and w.progress >= 0.45:
                        w.face_sent = True
                        emb = noisy(person_vector(w.person_id), self.rng.uniform(0.6, 1.1), self.rng) if w.person_id else random_face(self.rng)
                        frame = to_jpeg(render_frame(self.name, self.direction, self.walkers, self.counts(), highlight=w.track_id))
                        face = to_jpeg(render_portrait(w.look, seed=w.track_id, snapshot=True))
                        apply_result(w, self.api.face(self.cam_id, f"C{self.cam_id}-{w.track_id}", emb, face, frame), self.names)
                    if w.progress > 1.05:
                        self.walkers.remove(w)
                self.api.frame(self.cam_id, to_jpeg(render_frame(self.name, self.direction, self.walkers, self.counts()), 70))
                if t0 - last_beat > 10:
                    self.api.heartbeat(self.cam_id)
                    last_beat = t0
            except httpx.HTTPError as e:
                log(f"[{self.name}] ส่งข้อมูลไม่สำเร็จ: {e}")
                time.sleep(2)
            time.sleep(max(0, 1 / self.fps - (time.time() - t0)))


class WebcamCamera(threading.Thread):
    """Real webcam + OpenCV Haar face detector + a simple centroid tracker."""

    def __init__(self, cam, url, index, as_person, names, stop):
        super().__init__(daemon=True)
        import cv2
        self.cv2 = cv2
        self.cam_id, self.name, self.direction = cam
        self.api = Pipeline(url)
        self.as_person, self.names, self.stop = as_person, names, stop
        self.rng = random.Random()
        # OpenCV cannot open files under non-ASCII paths on Windows, so copy the model to temp
        src = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        dst = Path(tempfile.gettempdir()) / "smartpole_haarcascade_frontalface_default.xml"
        if not dst.exists():
            shutil.copyfile(src, dst)
        self.detector = cv2.CascadeClassifier(str(dst))
        self.cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        self.ok = self.cap.isOpened() and not self.detector.empty()
        self.tracks: dict[int, dict] = {}
        self.next_id = self.cam_id * 100000 + 50000
        self.counted = 0

    def run(self):
        cv2 = self.cv2
        last_beat, frame_no = 0, 0
        while not self.stop.is_set():
            ok, img = self.cap.read()
            if not ok:
                time.sleep(0.2)
                continue
            frame_no += 1
            img = cv2.resize(img, (W, H))
            gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
            faces = self.detector.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=6, minSize=(48, 48))

            seen = set()
            for (x, y, w, h) in faces:
                cx, cy = x + w // 2, y + h // 2
                tid = min(self.tracks, key=lambda t: (self.tracks[t]["cx"] - cx) ** 2 + (self.tracks[t]["cy"] - cy) ** 2, default=None)
                if tid is None or (self.tracks[tid]["cx"] - cx) ** 2 + (self.tracks[tid]["cy"] - cy) ** 2 > 90 ** 2 or tid in seen:
                    self.next_id += 1
                    tid = self.next_id
                    self.tracks[tid] = {"n": 0, "face_sent": False, "status": "unknown", "label": "", "side": None}
                t = self.tracks[tid]
                t.update(cx=cx, cy=cy, box=(x, y, w, h), last=frame_no)
                t["n"] += 1
                seen.add(tid)
                side = cy > LINE_Y
                if t["side"] is not None and side != t["side"]:
                    self.counted += 1
                    self.api.count(self.cam_id, self.direction, f"W{tid}")
                t["side"] = side

            for tid in [k for k, v in self.tracks.items() if frame_no - v["last"] > 15]:
                del self.tracks[tid]

            annotated = img.copy()
            for x in range(0, W, 22):
                cv2.line(annotated, (x, LINE_Y), (x + 12, LINE_Y), (80, 60, 232), 3)
            for tid, t in self.tracks.items():
                if t["last"] != frame_no:
                    continue
                x, y, w, h = t["box"]
                col = {"unknown": (140, 214, 64), "blacklist": (70, 40, 232), "vip": (60, 190, 242)}[t["status"]]
                cv2.rectangle(annotated, (x, y), (x + w, y + h), col, 2)
                label = t["label"] or f"ID {tid}"
                cv2.rectangle(annotated, (x, y - 18), (x + 9 * len(label) + 8, y), col, -1)
                cv2.putText(annotated, label, (x + 4, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (10, 10, 10), 1, cv2.LINE_AA)
            cv2.rectangle(annotated, (0, H - 26), (W, H), (0, 0, 0), -1)
            cv2.putText(annotated, f"{self.name}  WEBCAM", (10, H - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(annotated, time.strftime("%Y-%m-%d  %H:%M:%S"), (W // 2 - 80, H - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1, cv2.LINE_AA)
            cv2.putText(annotated, f"FACES {len(seen)}   COUNT {self.counted}", (W - 190, H - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (190, 230, 140), 1, cv2.LINE_AA)

            try:
                for tid in seen:
                    t = self.tracks[tid]
                    if t["n"] >= 5 and not t["face_sent"]:
                        t["face_sent"] = True
                        x, y, w, h = t["box"]
                        m = int(0.25 * w)
                        crop = img[max(0, y - m):y + h + m, max(0, x - m):x + w + m]
                        crop = cv2.resize(crop, (200, int(200 * crop.shape[0] / max(1, crop.shape[1]))))
                        emb = noisy(person_vector(self.as_person), 0.8, self.rng) if self.as_person else random_face(self.rng)
                        res = self.api.face(self.cam_id, f"W{tid}", emb, cv2.imencode(".jpg", crop)[1].tobytes(),
                                            cv2.imencode(".jpg", annotated)[1].tobytes())
                        if res.get("matched"):
                            t["status"] = self.names[res["person_id"]]["category"]
                            t["label"] = f"{t['status'].upper()} {res['similarity']:.2f}"
                            if res.get("alert"):
                                log(f"[แจ้งเตือน] {self.name} (เว็บแคม) {t['status'].upper()} ความคล้าย {res['similarity']}")
                        else:
                            log(f"[{self.name}] พบใบหน้าใหม่ ID {tid} (ไม่อยู่ในรายชื่อเฝ้าระวัง)")
                self.api.frame(self.cam_id, cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 72])[1].tobytes())
                if time.time() - last_beat > 10:
                    self.api.heartbeat(self.cam_id)
                    last_beat = time.time()
            except httpx.HTTPError as e:
                log(f"[{self.name}] ส่งข้อมูลไม่สำเร็จ: {e}")
                time.sleep(2)
            time.sleep(0.05)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--fps", type=int, default=8, help="frames per second per camera")
    ap.add_argument("--busy", type=float, default=0.45, help="new people per second per camera")
    ap.add_argument("--fast", action="store_true", help="busier scene, for demos")
    ap.add_argument("--webcam", action="store_true", help="use the webcam as CAM 1")
    ap.add_argument("--webcam-index", type=int, default=0)
    ap.add_argument("--webcam-as", type=int, default=None, help="treat webcam faces as this watchlist person_id")
    args = ap.parse_args()

    watchlist = Pipeline(args.url).http.get("/api/ingest/watchlist").json()
    names = {p["person_id"]: p for p in watchlist}
    stop = threading.Event()
    busy = args.busy * (1.6 if args.fast else 1)

    threads = []
    for cam in CAMERAS:
        if args.webcam and cam[0] == 1:
            wc = WebcamCamera(cam, args.url, args.webcam_index, args.webcam_as, names, stop)
            if wc.ok:
                threads.append(wc)
                log("CAM 1 ใช้เว็บแคมพร้อมตรวจจับใบหน้าจริง (OpenCV)")
                continue
            log("เปิดเว็บแคมไม่ได้ ใช้ภาพจำลองแทน")
        threads.append(DrawnCamera(cam, args.url, watchlist, args.fps, busy, stop))

    log(f"เชื่อมต่อ {args.url} แล้ว | รายชื่อเฝ้าระวัง {len(watchlist)} คน | กล้อง {len(threads)} ตัว | กด Ctrl+C เพื่อหยุด")
    for t in threads:
        t.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        stop.set()
        log("หยุดการจำลองแล้ว")


if __name__ == "__main__":
    main()
