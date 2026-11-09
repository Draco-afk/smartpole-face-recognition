import asyncio
import base64
import csv
import io
import json
import uuid
from datetime import date, datetime, time, timedelta

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import config
from .db import Base, SessionLocal, engine, get_db
from .frames import frames
from .matching import index, normalize
from .models import Alert, Camera, FaceEmbedding, PeopleCount, Person, User
from .realtime import hub
from .security import create_token, current_user, hash_password, pipeline_key, require_roles, user_from_token, verify_password

Base.metadata.create_all(engine)

app = FastAPI(title="Smart Pole Face Recognition API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=config.MEDIA_DIR), name="media")

ADMIN = require_roles("admin")
VIEWERS = require_roles("admin", "executive", "security")
EXEC_OR_ADMIN = require_roles("admin", "executive")


# ---------------------------------------------------------------- helpers
def day_range(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min)
    return start, start + timedelta(days=1)


def media_url(path: str | None) -> str | None:
    return f"/media/{path}" if path else None


def camera_status(c: Camera) -> str:
    age = frames.age(c.camera_id)
    if age is not None and age <= config.CAMERA_OFFLINE_SEC:
        return "online"
    if c.last_seen and (datetime.now() - c.last_seen).total_seconds() <= config.CAMERA_OFFLINE_SEC:
        return "online"
    return "offline"


def user_out(u: User) -> dict:
    return {"user_id": u.user_id, "username": u.username, "full_name": u.full_name, "role": u.role, "created_at": u.created_at}


def camera_out(c: Camera) -> dict:
    return {"camera_id": c.camera_id, "camera_name": c.camera_name, "rtsp_url": c.rtsp_url, "location": c.location,
            "direction": c.direction, "status": camera_status(c), "last_seen": c.last_seen,
            "has_video": (frames.age(c.camera_id) or 1e9) < 10}


def person_out(p: Person) -> dict:
    return {"person_id": p.person_id, "full_name": p.full_name, "category": p.category, "note": p.note,
            "photo_url": media_url(p.photo_path), "embedding_count": len(p.embeddings), "created_at": p.created_at}


def alert_out(a: Alert) -> dict:
    return {"alert_id": a.alert_id, "similarity": round(a.similarity, 3), "detected_at": a.detected_at,
            "snapshot_url": media_url(a.snapshot_path), "frame_url": media_url(a.frame_path), "is_acknowledged": a.is_acknowledged, "acknowledged_at": a.acknowledged_at,
            "person": {"person_id": a.person.person_id, "full_name": a.person.full_name, "category": a.person.category,
                       "note": a.person.note, "photo_url": media_url(a.person.photo_path)},
            "camera": {"camera_id": a.camera.camera_id, "camera_name": a.camera.camera_name, "location": a.camera.location,
                       "direction": a.camera.direction}}


def counts_between(db: Session, start: datetime, end: datetime) -> dict:
    rows = db.query(PeopleCount.direction, func.count()).filter(PeopleCount.counted_at >= start, PeopleCount.counted_at < end).group_by(PeopleCount.direction).all()
    d = dict(rows)
    return {"in": d.get("in", 0), "out": d.get("out", 0)}


# ---------------------------------------------------------------- auth
class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    return {"token": create_token(user), "user": user_out(user)}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


# ---------------------------------------------------------------- dashboard
@app.get("/api/dashboard")
def dashboard(d: date | None = None, db: Session = Depends(get_db), _: User = Depends(VIEWERS)):
    d = d or date.today()
    start, end = day_range(d)
    totals = counts_between(db, start, end)

    hour_col = func.strftime("%H", PeopleCount.counted_at) if engine.dialect.name == "sqlite" else func.extract("hour", PeopleCount.counted_at)
    hourly = {h: {"hour": h, "in": 0, "out": 0} for h in range(24)}
    for h, direction, n in db.query(hour_col, PeopleCount.direction, func.count()).filter(
            PeopleCount.counted_at >= start, PeopleCount.counted_at < end).group_by(hour_col, PeopleCount.direction):
        hourly[int(h)][direction] = n

    per_cam = dict(db.query(PeopleCount.camera_id, func.count()).filter(
        PeopleCount.counted_at >= start, PeopleCount.counted_at < end).group_by(PeopleCount.camera_id).all())
    cams = [{**camera_out(c), "count": per_cam.get(c.camera_id, 0)} for c in db.query(Camera).order_by(Camera.camera_id)]

    alert_q = db.query(Alert).join(Person).filter(Alert.detected_at >= start, Alert.detected_at < end)
    by_cat = dict(db.query(Person.category, func.count()).select_from(Alert).join(Person).filter(
        Alert.detected_at >= start, Alert.detected_at < end).group_by(Person.category).all())
    pending = alert_q.filter(Alert.is_acknowledged.is_(False)).count()
    latest = alert_q.order_by(Alert.detected_at.desc()).limit(8).all()

    return {"date": d, "in": totals["in"], "out": totals["out"], "inside": max(totals["in"] - totals["out"], 0),
            "alerts": {"blacklist": by_cat.get("blacklist", 0), "vip": by_cat.get("vip", 0), "pending": pending},
            "hourly": list(hourly.values()), "cameras": cams, "latest_alerts": [alert_out(a) for a in latest]}


# ---------------------------------------------------------------- alerts
@app.get("/api/alerts")
def list_alerts(category: str | None = None, acknowledged: bool | None = None, camera_id: int | None = None,
                date_from: date | None = None, date_to: date | None = None, q: str | None = None,
                limit: int = Query(50, le=200), offset: int = 0, db: Session = Depends(get_db), _: User = Depends(VIEWERS)):
    qry = db.query(Alert).join(Person)
    if category:
        qry = qry.filter(Person.category == category)
    if acknowledged is not None:
        qry = qry.filter(Alert.is_acknowledged.is_(acknowledged))
    if camera_id:
        qry = qry.filter(Alert.camera_id == camera_id)
    if date_from:
        qry = qry.filter(Alert.detected_at >= day_range(date_from)[0])
    if date_to:
        qry = qry.filter(Alert.detected_at < day_range(date_to)[1])
    if q:
        qry = qry.filter(Person.full_name.contains(q))
    total = qry.count()
    items = qry.order_by(Alert.detected_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [alert_out(a) for a in items]}


@app.post("/api/alerts/{alert_id}/ack")
async def ack_alert(alert_id: int, db: Session = Depends(get_db), user: User = Depends(VIEWERS)):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "ไม่พบการแจ้งเตือนนี้")
    if not a.is_acknowledged:
        a.is_acknowledged, a.acknowledged_by, a.acknowledged_at = True, user.user_id, datetime.now()
        db.commit()
    out = alert_out(a)
    await hub.broadcast("alert_ack", out)
    return out


# ---------------------------------------------------------------- reports
def daily_rows(db: Session, date_from: date, date_to: date) -> list[dict]:
    start, end = day_range(date_from)[0], day_range(date_to)[1]
    day_col = func.date(PeopleCount.counted_at)
    data = {}
    for dstr, direction, n in db.query(day_col, PeopleCount.direction, func.count()).filter(
            PeopleCount.counted_at >= start, PeopleCount.counted_at < end).group_by(day_col, PeopleCount.direction):
        data.setdefault(str(dstr), {})[direction] = n
    adata = {}
    for dstr, cat, n in db.query(func.date(Alert.detected_at), Person.category, func.count()).select_from(Alert).join(Person).filter(
            Alert.detected_at >= start, Alert.detected_at < end).group_by(func.date(Alert.detected_at), Person.category):
        adata.setdefault(str(dstr), {})[cat] = n
    rows, d = [], date_from
    while d <= date_to:
        k = d.isoformat()
        rows.append({"date": k, "in": data.get(k, {}).get("in", 0), "out": data.get(k, {}).get("out", 0),
                     "blacklist": adata.get(k, {}).get("blacklist", 0), "vip": adata.get(k, {}).get("vip", 0)})
        d += timedelta(days=1)
    return rows


@app.get("/api/reports/daily")
def report_daily(date_from: date, date_to: date, db: Session = Depends(get_db), _: User = Depends(EXEC_OR_ADMIN)):
    if date_to < date_from or (date_to - date_from).days > 366:
        raise HTTPException(400, "ช่วงวันที่ไม่ถูกต้อง (เลือกได้ไม่เกิน 1 ปี)")
    return daily_rows(db, date_from, date_to)


@app.get("/api/reports/daily.csv")
def report_csv(date_from: date, date_to: date, token: str, db: Session = Depends(get_db)):
    user = user_from_token(token, db)
    if not user or user.role not in ("admin", "executive"):
        raise HTTPException(401, "กรุณาเข้าสู่ระบบใหม่")
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel shows Thai correctly
    w = csv.writer(buf)
    w.writerow(["วันที่", "จำนวนคนเข้า", "จำนวนคนออก", "แจ้งเตือน Blacklist", "แจ้งเตือน VIP"])
    for r in daily_rows(db, date_from, date_to):
        w.writerow([r["date"], r["in"], r["out"], r["blacklist"], r["vip"]])
    buf.seek(0)
    name = f"smartpole_report_{date_from}_{date_to}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- persons (watchlist)
class PersonIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    category: str = Field(pattern="^(blacklist|vip)$")
    note: str = ""


@app.get("/api/persons")
def list_persons(category: str | None = None, q: str | None = None, db: Session = Depends(get_db), _: User = Depends(VIEWERS)):
    qry = db.query(Person)
    if category:
        qry = qry.filter(Person.category == category)
    if q:
        qry = qry.filter(Person.full_name.contains(q))
    return [person_out(p) for p in qry.order_by(Person.created_at.desc())]


@app.post("/api/persons")
def create_person(body: PersonIn, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    p = Person(**body.model_dump(), created_by=user.user_id)
    db.add(p)
    db.commit()
    return person_out(p)


@app.put("/api/persons/{person_id}")
def update_person(person_id: int, body: PersonIn, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    p = db.get(Person, person_id)
    if not p:
        raise HTTPException(404, "ไม่พบบุคคลนี้")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return person_out(p)


@app.delete("/api/persons/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    p = db.get(Person, person_id)
    if not p:
        raise HTTPException(404, "ไม่พบบุคคลนี้")
    db.query(Alert).filter(Alert.person_id == person_id).delete()
    db.delete(p)
    db.commit()
    index.dirty = True
    return {"ok": True}


@app.post("/api/persons/{person_id}/photo")
async def upload_photo(person_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    p = db.get(Person, person_id)
    if not p:
        raise HTTPException(404, "ไม่พบบุคคลนี้")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(400, "รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "ไฟล์ต้องมีขนาดไม่เกิน 5 MB")
    rel = f"faces/{person_id}_{uuid.uuid4().hex[:8]}.{ext}"
    (config.MEDIA_DIR / rel).write_bytes(data)
    p.photo_path = rel
    db.commit()
    return person_out(p)


# ---------------------------------------------------------------- cameras
class CameraIn(BaseModel):
    camera_name: str
    rtsp_url: str = ""
    location: str = ""
    direction: str = Field(pattern="^(in|out)$")


@app.get("/api/cameras")
def list_cameras(db: Session = Depends(get_db), _: User = Depends(VIEWERS)):
    return [camera_out(c) for c in db.query(Camera).order_by(Camera.camera_id)]


@app.post("/api/cameras")
def create_camera(body: CameraIn, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    c = Camera(**body.model_dump())
    db.add(c)
    db.commit()
    return camera_out(c)


@app.put("/api/cameras/{camera_id}")
def update_camera(camera_id: int, body: CameraIn, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    c = db.get(Camera, camera_id)
    if not c:
        raise HTTPException(404, "ไม่พบกล้องนี้")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return camera_out(c)


# ---------------------------------------------------------------- users
class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=1)
    role: str = Field(pattern="^(admin|executive|security)$")
    password: str | None = None


@app.get("/api/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    return [user_out(u) for u in db.query(User).order_by(User.user_id)]


@app.post("/api/users")
def create_user(body: UserIn, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "ชื่อผู้ใช้นี้ถูกใช้แล้ว")
    u = User(username=body.username, full_name=body.full_name, role=body.role, password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    return user_out(u)


@app.put("/api/users/{user_id}")
def update_user(user_id: int, body: UserIn, db: Session = Depends(get_db), me_: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "ไม่พบผู้ใช้นี้")
    if u.user_id == me_.user_id and body.role != "admin":
        raise HTTPException(400, "ไม่สามารถลดสิทธิ์ของบัญชีที่กำลังใช้งานอยู่")
    u.username, u.full_name, u.role = body.username, body.full_name, body.role
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร")
        u.password_hash = hash_password(body.password)
    db.commit()
    return user_out(u)


@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), me_: User = Depends(ADMIN)):
    if user_id == me_.user_id:
        raise HTTPException(400, "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "ไม่พบผู้ใช้นี้")
    # keep history rows, just detach them from the deleted account
    db.query(Alert).filter(Alert.acknowledged_by == user_id).update({Alert.acknowledged_by: None})
    db.query(Person).filter(Person.created_by == user_id).update({Person.created_by: None})
    db.delete(u)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- AI pipeline ingest (X-API-Key)
class CountIn(BaseModel):
    camera_id: int
    direction: str = Field(pattern="^(in|out)$")
    track_id: str


class FaceIn(BaseModel):
    camera_id: int
    track_id: str
    embedding: list[float]
    snapshot_b64: str | None = None  # face crop, JPEG bytes as base64
    frame_b64: str | None = None     # full camera frame at detection time


class EmbeddingIn(BaseModel):
    person_id: int
    embedding: list[float]
    image_path: str | None = None


class HeartbeatIn(BaseModel):
    camera_id: int


def _touch_camera(db: Session, camera_id: int) -> Camera:
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(404, f"Unknown camera_id {camera_id}")
    cam.last_seen = datetime.now()
    return cam


@app.post("/api/ingest/heartbeat", dependencies=[Depends(pipeline_key)])
def ingest_heartbeat(body: HeartbeatIn, db: Session = Depends(get_db)):
    _touch_camera(db, body.camera_id)
    db.commit()
    return {"ok": True}


@app.post("/api/ingest/count", dependencies=[Depends(pipeline_key)])
async def ingest_count(body: CountIn, db: Session = Depends(get_db)):
    _touch_camera(db, body.camera_id)
    db.add(PeopleCount(camera_id=body.camera_id, direction=body.direction, track_id=body.track_id))
    db.commit()
    start, end = day_range(date.today())
    totals = counts_between(db, start, end)
    await hub.broadcast("count", {"camera_id": body.camera_id, "direction": body.direction, "hour": datetime.now().hour,
                                  "in": totals["in"], "out": totals["out"], "inside": max(totals["in"] - totals["out"], 0)})
    return {"ok": True, **totals}


@app.post("/api/ingest/face", dependencies=[Depends(pipeline_key)])
async def ingest_face(body: FaceIn, db: Session = Depends(get_db)):
    """Compare one face embedding against the watchlist and raise an alert on a match."""
    _touch_camera(db, body.camera_id)
    person_id, sim = index.best_match(db, body.embedding)
    if person_id is None or sim < config.MATCH_THRESHOLD:
        db.commit()
        return {"matched": False, "similarity": round(sim, 3)}

    since = datetime.now() - timedelta(seconds=config.ALERT_COOLDOWN_SEC)
    recent = db.query(Alert).filter(Alert.person_id == person_id, Alert.detected_at >= since).first()
    if recent:
        db.commit()
        return {"matched": True, "person_id": person_id, "similarity": round(sim, 3), "alert": None, "reason": "cooldown"}

    def save(b64: str | None, kind: str) -> str | None:
        if not b64:
            return None
        rel = f"snapshots/{datetime.now():%Y%m%d}_{uuid.uuid4().hex[:12]}_{kind}.jpg"
        (config.MEDIA_DIR / rel).write_bytes(base64.b64decode(b64))
        return rel

    a = Alert(person_id=person_id, camera_id=body.camera_id, similarity=sim,
              snapshot_path=save(body.snapshot_b64, "face"), frame_path=save(body.frame_b64, "frame"))
    db.add(a)
    db.commit()
    out = alert_out(a)
    await hub.broadcast("alert", out)
    return {"matched": True, "person_id": person_id, "similarity": round(sim, 3), "alert": out}


@app.post("/api/ingest/frame/{camera_id}", dependencies=[Depends(pipeline_key)])
async def ingest_frame(camera_id: int, request: Request):
    """Latest annotated JPEG from the pipeline (body = raw image/jpeg). Viewers get it via /ws/video."""
    data = await request.body()
    if not data.startswith(bytes([0xFF, 0xD8])):  # JPEG magic number
        raise HTTPException(400, "Body must be a JPEG image")
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(413, "Frame too large (max 2 MB)")
    frames.put(camera_id, data)
    return {"ok": True}


@app.get("/api/ingest/watchlist", dependencies=[Depends(pipeline_key)])
def ingest_watchlist(db: Session = Depends(get_db)):
    """Persons the pipeline may need to enrol (embedding_count == 0 means a photo is waiting for a vector)."""
    return [{"person_id": p.person_id, "category": p.category, "photo_url": media_url(p.photo_path),
             "embedding_count": len(p.embeddings)} for p in db.query(Person)]


@app.post("/api/ingest/embedding", dependencies=[Depends(pipeline_key)])
def ingest_embedding(body: EmbeddingIn, db: Session = Depends(get_db)):
    """Enrol a face vector for a watchlist person (computed by the recognition model)."""
    if not db.get(Person, body.person_id):
        raise HTTPException(404, "Unknown person_id")
    db.add(FaceEmbedding(person_id=body.person_id, vector=json.dumps(normalize(body.embedding)), image_path=body.image_path))
    db.commit()
    index.dirty = True
    return {"ok": True}


# ---------------------------------------------------------------- websocket
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = ""):
    db = SessionLocal()
    try:
        user = user_from_token(token, db)
    finally:
        db.close()
    if not user:
        await ws.close(code=4401)
        return
    await hub.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive pings from the browser
    except WebSocketDisconnect:
        hub.disconnect(ws)


@app.websocket("/ws/video")
async def ws_video(ws: WebSocket, token: str = "", cams: str = "", fps: int = 10):
    """Binary messages: 1 byte camera_id + JPEG bytes. Only sends a camera when it has a new frame."""
    db = SessionLocal()
    try:
        user = user_from_token(token, db)
    finally:
        db.close()
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    wanted = [int(c) for c in cams.split(",") if c.strip().isdigit()][:16]
    sent: dict[int, int] = {}
    delay = 1 / max(1, min(fps, 25))
    try:
        while True:
            for cid in wanted:
                f = frames.get(cid)
                if f and sent.get(cid) != f.seq:
                    await ws.send_bytes(bytes([cid]) + f.jpeg)
                    sent[cid] = f.seq
            await asyncio.sleep(delay)
    except (WebSocketDisconnect, RuntimeError):
        pass


@app.get("/api/cameras/{camera_id}/latest.jpg")
def latest_frame(camera_id: int, token: str, db: Session = Depends(get_db)):
    """Current frame as a still image (for saving a capture)."""
    if not user_from_token(token, db):
        raise HTTPException(401, "กรุณาเข้าสู่ระบบใหม่")
    f = frames.get(camera_id)
    if not f:
        raise HTTPException(404, "กล้องนี้ยังไม่มีภาพ")
    return StreamingResponse(iter([f.jpeg]), media_type="image/jpeg",
                             headers={"Content-Disposition": f'attachment; filename="cam{camera_id}_{datetime.now():%Y%m%d_%H%M%S}.jpg"'})


# ---------------------------------------------------------------- built frontend (production)
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        f = config.FRONTEND_DIST / full_path
        if full_path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
