import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import JWT_HOURS, JWT_SECRET, PIPELINE_API_KEY
from .db import get_db
from .models import User

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_token(user: User) -> str:
    payload = {"sub": str(user.user_id), "role": user.role, "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return db.get(User, int(payload["sub"]))


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    user = user_from_token(creds.credentials, db) if creds else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "กรุณาเข้าสู่ระบบใหม่")
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้")
        return user
    return checker


def pipeline_key(x_api_key: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_api_key, PIPELINE_API_KEY):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid pipeline API key")
