import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_DIR = BASE_DIR / "media"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'smartpole.db'}")
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret-before-deploy")
JWT_HOURS = int(os.getenv("JWT_HOURS", "12"))

# Key the AI pipeline uses when it posts events (header: X-API-Key)
PIPELINE_API_KEY = os.getenv("PIPELINE_API_KEY", "smartpole-pipeline-key")

# Face matching
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.45"))   # cosine similarity
ALERT_COOLDOWN_SEC = int(os.getenv("ALERT_COOLDOWN_SEC", "300"))  # no repeat alert for same person
CAMERA_OFFLINE_SEC = int(os.getenv("CAMERA_OFFLINE_SEC", "60"))   # heartbeat timeout

MEDIA_DIR.mkdir(exist_ok=True)
(MEDIA_DIR / "faces").mkdir(exist_ok=True)
(MEDIA_DIR / "snapshots").mkdir(exist_ok=True)
