"""Small client for the real AI pipeline (YOLO face detector + ByteTrack + embedding model).

Usage inside your camera loop:

    from pipeline_client import SmartPoleClient
    sp = SmartPoleClient("http://<server>:8000", api_key="smartpole-pipeline-key")

    sp.frame(camera_id, annotated_bgr)                       # every frame (5-10 fps) -> live view on the web
    sp.heartbeat(camera_id)                                  # every ~10 s per camera
    sp.count(camera_id, "in", track_id)                      # when a track crosses the virtual line
    result = sp.face(camera_id, track_id, embedding, face_crop_bgr, annotated_bgr)  # once per confirmed face
    sp.enroll(person_id, embedding)                          # after computing a vector for a watchlist photo
    sp.pending_enrolment()                                   # persons with a photo but no vector yet
"""
import base64

import httpx


def _jpeg(img_bgr, quality: int = 80) -> bytes:
    import cv2
    ok, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise ValueError("could not encode image")
    return buf.tobytes()


class SmartPoleClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 5.0):
        self.http = httpx.Client(base_url=base_url, headers={"X-API-Key": api_key}, timeout=timeout)

    def frame(self, camera_id: int, img_bgr, quality: int = 70) -> None:
        """Send the annotated frame (boxes, IDs, virtual line already drawn) for the live view."""
        self.http.post(f"/api/ingest/frame/{camera_id}", content=_jpeg(img_bgr, quality),
                       headers={"Content-Type": "image/jpeg"}).raise_for_status()

    def heartbeat(self, camera_id: int) -> None:
        self.http.post("/api/ingest/heartbeat", json={"camera_id": camera_id}).raise_for_status()

    def count(self, camera_id: int, direction: str, track_id) -> dict:
        r = self.http.post("/api/ingest/count", json={"camera_id": camera_id, "direction": direction, "track_id": str(track_id)})
        r.raise_for_status()
        return r.json()

    def face(self, camera_id: int, track_id, embedding, crop_bgr=None, frame_bgr=None) -> dict:
        """embedding: list/ndarray of floats. crop_bgr: face crop, frame_bgr: whole frame.
        Both images are stored with the alert when the face matches the watchlist."""
        body = {"camera_id": camera_id, "track_id": str(track_id), "embedding": [float(x) for x in embedding]}
        if crop_bgr is not None:
            body["snapshot_b64"] = base64.b64encode(_jpeg(crop_bgr, 85)).decode()
        if frame_bgr is not None:
            body["frame_b64"] = base64.b64encode(_jpeg(frame_bgr, 75)).decode()
        r = self.http.post("/api/ingest/face", json=body)
        r.raise_for_status()
        return r.json()

    def enroll(self, person_id: int, embedding, image_path: str | None = None) -> None:
        body = {"person_id": person_id, "embedding": [float(x) for x in embedding], "image_path": image_path}
        self.http.post("/api/ingest/embedding", json=body).raise_for_status()

    def pending_enrolment(self) -> list[dict]:
        r = self.http.get("/api/ingest/watchlist")
        r.raise_for_status()
        return [p for p in r.json() if p["photo_url"] and p["embedding_count"] == 0]
