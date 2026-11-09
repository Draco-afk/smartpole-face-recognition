"""Create demo data: users, 4 cameras, watchlist persons and 14 days of history.
Run:  python seed.py          (asks before wiping an existing database)
      python seed.py --force"""
import json
import random
import sys
from datetime import date, datetime, timedelta

import shutil

from app.config import DATABASE_URL, MEDIA_DIR
from app.db import Base, SessionLocal, engine
from app.fakevec import person_vector
from app.matching import normalize
from app.models import Alert, Camera, FaceEmbedding, PeopleCount, Person, User
from app.security import hash_password
from demo.scene import Look, Walker, render_frame, render_portrait, to_jpeg

if engine.dialect.name == "sqlite" and "--force" not in sys.argv:
    from sqlalchemy import inspect
    if inspect(engine).has_table("users"):
        if input(f"ฐานข้อมูล {DATABASE_URL} มีข้อมูลอยู่แล้ว ต้องการลบและสร้างใหม่หรือไม่? (y/N) ").strip().lower() != "y":
            sys.exit(0)

Base.metadata.drop_all(engine)
for sub in ("faces", "snapshots"):
    shutil.rmtree(MEDIA_DIR / sub, ignore_errors=True)
    (MEDIA_DIR / sub).mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(engine)
db = SessionLocal()
rng = random.Random(2569)

users = [
    User(username="admin", full_name="ผู้ดูแลระบบ", role="admin", password_hash=hash_password("admin123")),
    User(username="executive", full_name="ผู้บริหาร (ทดสอบ)", role="executive", password_hash=hash_password("exec123")),
    User(username="security", full_name="เจ้าหน้าที่ รปภ. (ทดสอบ)", role="security", password_hash=hash_password("security123")),
]
db.add_all(users)

cams = [
    Camera(camera_name="CAM 1", location="ประตูหลัก ช่องทางเข้า (ซ้าย)", direction="in", rtsp_url="rtsp://192.168.1.101:554/stream1"),
    Camera(camera_name="CAM 2", location="ประตูหลัก ช่องทางเข้า (ขวา)", direction="in", rtsp_url="rtsp://192.168.1.102:554/stream1"),
    Camera(camera_name="CAM 3", location="ประตูหลัก ช่องทางออก", direction="out", rtsp_url="rtsp://192.168.1.103:554/stream1"),
]
db.add_all(cams)
db.flush()

people = [
    ("บุคคลทดสอบ A", "blacklist", "เคยก่อเหตุทะเลาะวิวาทในพื้นที่ (ข้อมูลสมมติ)"),
    ("บุคคลทดสอบ B", "blacklist", "ถูกระงับสิทธิ์เข้าพื้นที่ (ข้อมูลสมมติ)"),
    ("บุคคลทดสอบ C", "blacklist", "อยู่ระหว่างตรวจสอบ (ข้อมูลสมมติ)"),
    ("แขกผู้มีเกียรติ D", "vip", "ผู้บริหารหน่วยงานพันธมิตร (ข้อมูลสมมติ)"),
    ("แขกผู้มีเกียรติ E", "vip", "วิทยากรรับเชิญ (ข้อมูลสมมติ)"),
    ("แขกผู้มีเกียรติ F", "vip", "ผู้สนับสนุนโครงการ (ข้อมูลสมมติ)"),
]
persons = [Person(full_name=n, category=c, note=note, created_by=users[0].user_id) for n, c, note in people]
db.add_all(persons)
db.flush()
for p in persons:
    db.add(FaceEmbedding(person_id=p.person_id, vector=json.dumps(normalize(person_vector(p.person_id)))))
    p.photo_path = f"faces/{p.person_id}_registered.jpg"
    (MEDIA_DIR / p.photo_path).write_bytes(to_jpeg(render_portrait(Look.for_person(p.person_id), snapshot=False), 88))


def alert_images(p: Person, cam: Camera, n: int, sim: float) -> tuple[str, str]:
    """Face crop + full frame for a demo alert, drawn the way the pipeline would send them."""
    w = Walker(track_id=rng.randint(100, 999), look=Look.for_person(p.person_id), x=rng.uniform(0.3, 0.7),
               progress=rng.uniform(0.42, 0.55), person_id=p.person_id, category=p.category, status=p.category)
    others = [Walker(track_id=rng.randint(100, 999), look=Look.random(rng), x=rng.uniform(0.15, 0.85), progress=rng.uniform(0.05, 0.9))
              for _ in range(rng.randint(0, 2))]
    w.label = f"{p.category.upper()} {sim:.2f}"
    face = f"snapshots/seed_{n}_face.jpg"
    frame = f"snapshots/seed_{n}_frame.jpg"
    (MEDIA_DIR / face).write_bytes(to_jpeg(render_portrait(w.look, seed=n, snapshot=True)))
    (MEDIA_DIR / frame).write_bytes(to_jpeg(render_frame(cam.camera_name, cam.direction, others + [w], (0, 0), highlight=w.track_id)))
    return face, frame


# hourly traffic shape (people per hour, 0-23)
SHAPE = [0, 0, 0, 0, 0, 2, 10, 45, 70, 35, 22, 28, 40, 30, 22, 25, 38, 60, 42, 20, 10, 4, 1, 0]
now = datetime.now()
track = 0
alert_no = 0
for back in range(13, -1, -1):
    d = date.today() - timedelta(days=back)
    weekend = d.weekday() >= 5
    scale = rng.uniform(0.35, 0.5) if weekend else rng.uniform(0.85, 1.15)
    for h, base in enumerate(SHAPE):
        n = int(base * scale * rng.uniform(0.8, 1.2))
        # mornings lean "in", evenings lean "out"
        p_in = 0.85 if h < 11 else 0.5 if h < 15 else 0.2
        for _ in range(n):
            t = datetime(d.year, d.month, d.day, h, rng.randrange(60), rng.randrange(60))
            if t > now:
                continue
            track += 1
            direction = "in" if rng.random() < p_in else "out"
            cam = rng.choice(cams[:2] if direction == "in" else cams[2:3])
            db.add(PeopleCount(camera_id=cam.camera_id, direction=direction, track_id=f"T{track}", counted_at=t))
    for _ in range(rng.choice([0, 1, 1, 2, 2, 3])):
        t = datetime(d.year, d.month, d.day, rng.randint(7, 18), rng.randrange(60), rng.randrange(60))
        if t > now:
            continue
        p = rng.choice(persons)
        cam = rng.choice(cams)
        acked = back > 0 or rng.random() < 0.5
        alert_no += 1
        sim = rng.uniform(0.52, 0.86)
        face, frame = alert_images(p, cam, alert_no, sim)
        db.add(Alert(person_id=p.person_id, camera_id=cam.camera_id, similarity=sim,
                     snapshot_path=face, frame_path=frame,
                     detected_at=t, is_acknowledged=acked, acknowledged_by=users[2].user_id if acked else None,
                     acknowledged_at=t + timedelta(minutes=rng.randint(1, 9)) if acked else None))

db.commit()
print("สร้างข้อมูลตัวอย่างเรียบร้อย")
print("  admin / admin123        (ผู้ดูแลระบบ)")
print("  executive / exec123     (ผู้บริหาร)")
print("  security / security123  (เจ้าหน้าที่ รปภ.)")
