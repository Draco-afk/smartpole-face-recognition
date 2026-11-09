"""Synthetic camera scenes for the demo (used by simulator.py and seed.py).

Draws what the AI pipeline would send: a frame with people walking toward the
camera, the virtual line, face boxes with track IDs, plus face crops for alerts.
Nothing here is used by the real system."""
import io
import random
from dataclasses import dataclass, field
from datetime import datetime

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 640, 360
LINE_Y = int(H * 0.62)

SKINS = [(241, 204, 170), (224, 180, 140), (198, 150, 110), (165, 118, 82), (232, 190, 160)]
HAIRS = [(30, 25, 22), (60, 42, 30), (95, 70, 45), (20, 20, 20), (120, 110, 100)]
SHIRTS = [(52, 86, 140), (160, 50, 50), (60, 120, 80), (220, 220, 225), (40, 40, 45), (200, 150, 60), (110, 80, 140)]

COLOR = {"unknown": (64, 214, 140), "blacklist": (232, 40, 70), "vip": (242, 190, 60)}


def _font(size: int):
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_S, FONT_M = _font(12), _font(14)


@dataclass
class Look:
    skin: tuple
    hair: tuple
    shirt: tuple
    hair_style: str  # short | long | none | cap
    glasses: bool

    @staticmethod
    def random(rng: random.Random) -> "Look":
        return Look(rng.choice(SKINS), rng.choice(HAIRS), rng.choice(SHIRTS),
                    rng.choice(["short", "short", "long", "none", "cap"]), rng.random() < 0.25)

    @staticmethod
    def for_person(person_id: int) -> "Look":
        return Look.random(random.Random(f"look-{person_id}"))


@dataclass
class Walker:
    track_id: int
    look: Look
    x: float               # 0..1 across the frame
    progress: float = 0.0  # 0 = far (top), 1 = at the camera (bottom)
    speed: float = 0.006
    drift: float = 0.0
    person_id: int | None = None
    category: str | None = None
    status: str = "unknown"
    label: str = ""
    counted: bool = False
    face_sent: bool = False
    box: tuple = field(default=(0, 0, 0, 0))

    def step(self):
        self.progress += self.speed * (0.6 + self.progress)
        self.x = min(0.92, max(0.08, self.x + self.drift))


def _background(cam_name: str, direction: str, seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGB", (W, H), (58, 62, 68))
    d = ImageDraw.Draw(img)
    # far wall / building
    d.rectangle([0, 0, W, 70], fill=(96, 104, 112))
    for i in range(8):
        x = 20 + i * 80 + rng.randint(-6, 6)
        d.rectangle([x, 14, x + 46, 52], fill=(70, 86, 104))
    # floor with perspective lines
    vx = W // 2
    for i in range(-7, 8):
        d.line([(vx + i * 14, 70), (vx + i * 120, H)], fill=(70, 75, 82), width=1)
    for k in range(1, 9):
        y = 70 + (H - 70) * (k / 9) ** 1.6
        d.line([(0, y), (W, y)], fill=(68, 73, 80), width=1)
    # gate posts
    d.rectangle([60, 66, 74, 300], fill=(150, 156, 164))
    d.rectangle([W - 74, 66, W - 60, 300], fill=(150, 156, 164))
    d.rectangle([60, 62, W - 60, 72], fill=(170, 176, 184))
    return img


_BG_CACHE: dict = {}


def render_frame(cam_name: str, direction: str, walkers: list[Walker], counts: tuple[int, int], highlight: int | None = None) -> Image.Image:
    key = (cam_name, direction)
    if key not in _BG_CACHE:
        _BG_CACHE[key] = _background(cam_name, direction, hash(key) & 0xFFFF)
    img = _BG_CACHE[key].copy()
    d = ImageDraw.Draw(img)

    # virtual line
    for x in range(0, W, 22):
        d.line([(x, LINE_Y), (x + 12, LINE_Y)], fill=(232, 60, 80), width=3)
    d.text((W - 118, LINE_Y - 18), "VIRTUAL LINE", font=FONT_S, fill=(240, 120, 130))

    for w in sorted(walkers, key=lambda w: w.progress):
        s = 0.35 + 1.1 * w.progress
        cx = int(w.x * W)
        cy = int(80 + w.progress * (H - 40))
        r = int(13 * s)
        body_w, body_h = int(26 * s), int(60 * s)
        lk = w.look
        d.rounded_rectangle([cx - body_w, cy + r - 2, cx + body_w, cy + r + body_h], radius=int(10 * s), fill=lk.shirt)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=lk.skin)
        if lk.hair_style in ("short", "long"):
            d.chord([cx - r, cy - r - 1, cx + r, cy + r // 2], 180, 360, fill=lk.hair)
            if lk.hair_style == "long":
                d.rectangle([cx - r, cy - 2, cx - r + max(2, r // 3), cy + r + 4], fill=lk.hair)
                d.rectangle([cx + r - max(2, r // 3), cy - 2, cx + r, cy + r + 4], fill=lk.hair)
        elif lk.hair_style == "cap":
            d.chord([cx - r - 1, cy - r - 2, cx + r + 1, cy + r // 3], 180, 360, fill=(40, 60, 110))
        ey = cy - r // 6
        er = max(1, r // 7)
        d.ellipse([cx - r // 2 - er, ey - er, cx - r // 2 + er, ey + er], fill=(30, 30, 30))
        d.ellipse([cx + r // 2 - er, ey - er, cx + r // 2 + er, ey + er], fill=(30, 30, 30))
        if lk.glasses and r > 8:
            d.line([(cx - r + 2, ey), (cx + r - 2, ey)], fill=(20, 20, 20), width=max(1, r // 8))

        pad = int(r * 0.45)
        w.box = (cx - r - pad, cy - r - pad, cx + r + pad, cy + r + pad)
        col = COLOR[w.status]
        d.rectangle(w.box, outline=col, width=2)
        if highlight == w.track_id:
            # the face being sent for recognition: white outer frame so it stands out in the saved image
            x0, y0, x1, y1 = w.box
            d.rectangle([x0 - 5, y0 - 5, x1 + 5, y1 + 5], outline=(255, 255, 255), width=3)
            d.text((x0 - 4, y1 + 7), "MATCH", font=FONT_S, fill=(255, 255, 255))
        label = w.label or f"ID {w.track_id}"
        tw = d.textlength(label, font=FONT_S)
        d.rectangle([w.box[0], w.box[1] - 16, w.box[0] + tw + 8, w.box[1]], fill=col)
        d.text((w.box[0] + 4, w.box[1] - 15), label, font=FONT_S, fill=(10, 10, 10))

    # HUD
    d.rectangle([0, H - 26, W, H], fill=(0, 0, 0))
    d.text((10, H - 21), f"{cam_name}  {'ENTRY' if direction == 'in' else 'EXIT'}", font=FONT_M, fill=(255, 255, 255))
    d.text((W // 2 - 70, H - 21), datetime.now().strftime("%Y-%m-%d  %H:%M:%S"), font=FONT_M, fill=(220, 220, 220))
    d.text((W - 150, H - 21), f"IN {counts[0]}   OUT {counts[1]}", font=FONT_M, fill=(140, 230, 190))
    d.ellipse([W - 18, 8, W - 8, 18], fill=(232, 40, 70))
    d.text((W - 54, 5), "REC", font=FONT_S, fill=(255, 255, 255))
    return img


def render_portrait(look: Look, seed: int = 0, snapshot: bool = True) -> Image.Image:
    """A head-and-shoulders image. snapshot=True looks like a CCTV face crop; False like an ID photo."""
    rng = random.Random(seed)
    S = 2  # supersample
    w, h = 200 * S, 240 * S
    bg = (88, 94, 100) if snapshot else (214, 226, 238)
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    ox = (rng.randint(-12, 12) if snapshot else 0) * S
    cx, cy, r = w // 2 + ox, int(h * 0.42), int(62 * S)
    d.rounded_rectangle([cx - 150 * S // 2 - 30 * S, cy + r - 6 * S, cx + 150 * S // 2 + 30 * S, h + 40 * S], radius=50 * S, fill=look.shirt)
    d.rectangle([cx - 20 * S, cy + r - 20 * S, cx + 20 * S, cy + r + 10 * S], fill=tuple(int(c * 0.92) for c in look.skin))
    d.ellipse([cx - r, cy - int(r * 1.15), cx + r, cy + int(r * 1.05)], fill=look.skin)
    if look.hair_style in ("short", "long"):
        d.chord([cx - r - 4 * S, cy - int(r * 1.25), cx + r + 4 * S, cy + int(r * 0.35)], 180, 360, fill=look.hair)
        if look.hair_style == "long":
            d.rectangle([cx - r - 4 * S, cy - 10 * S, cx - r + 14 * S, cy + int(r * 1.3)], fill=look.hair)
            d.rectangle([cx + r - 14 * S, cy - 10 * S, cx + r + 4 * S, cy + int(r * 1.3)], fill=look.hair)
    elif look.hair_style == "cap":
        d.chord([cx - r - 6 * S, cy - int(r * 1.3), cx + r + 6 * S, cy + int(r * 0.15)], 180, 360, fill=(40, 60, 110))
        d.rectangle([cx - r - 6 * S, cy - 8 * S, cx + r + 30 * S, cy + 2 * S], fill=(30, 48, 92))
    ey, ex = cy - int(r * 0.12), int(r * 0.4)
    for sx in (-1, 1):
        d.ellipse([cx + sx * ex - 9 * S, ey - 6 * S, cx + sx * ex + 9 * S, ey + 6 * S], fill=(250, 250, 250))
        d.ellipse([cx + sx * ex - 5 * S, ey - 5 * S, cx + sx * ex + 5 * S, ey + 5 * S], fill=(40, 30, 25))
        d.line([(cx + sx * ex - 13 * S, ey - 16 * S), (cx + sx * ex + 13 * S, ey - 18 * S)], fill=look.hair, width=4 * S)
    if look.glasses:
        for sx in (-1, 1):
            d.rounded_rectangle([cx + sx * ex - 17 * S, ey - 13 * S, cx + sx * ex + 17 * S, ey + 12 * S], radius=6 * S, outline=(25, 25, 25), width=3 * S)
        d.line([(cx - ex + 17 * S, ey), (cx + ex - 17 * S, ey)], fill=(25, 25, 25), width=3 * S)
    d.line([(cx, ey + 8 * S), (cx - 6 * S, cy + int(r * 0.35)), (cx + 4 * S, cy + int(r * 0.38))], fill=tuple(int(c * 0.78) for c in look.skin), width=3 * S)
    d.arc([cx - 20 * S, cy + int(r * 0.42), cx + 20 * S, cy + int(r * 0.7)], 15, 165, fill=(150, 70, 70), width=4 * S)

    img = img.resize((200, 240), Image.LANCZOS)
    if snapshot:
        img = img.filter(ImageFilter.GaussianBlur(0.9))
        f = rng.uniform(0.8, 1.1)
        img = img.point(lambda v: max(0, min(255, int(v * f))))
    return img


def to_jpeg(img: Image.Image, quality: int = 72) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()
