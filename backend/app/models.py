"""Tables follow the ER diagram in Chapter 3 of the report (Figure 3.6)."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # admin | executive | security
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Camera(Base):
    __tablename__ = "cameras"
    camera_id: Mapped[int] = mapped_column(primary_key=True)
    camera_name: Mapped[str] = mapped_column(String(60))
    rtsp_url: Mapped[str] = mapped_column(String(255), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    direction: Mapped[str] = mapped_column(String(3))  # in | out
    status: Mapped[str] = mapped_column(String(10), default="offline")
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Person(Base):
    __tablename__ = "persons"
    person_id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(10))  # blacklist | vip
    note: Mapped[str] = mapped_column(Text, default="")
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    embeddings: Mapped[list["FaceEmbedding"]] = relationship(back_populates="person", cascade="all, delete-orphan")


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"
    embedding_id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.person_id"), index=True)
    vector: Mapped[str] = mapped_column(Text)  # JSON list of floats (L2-normalised)
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    person: Mapped[Person] = relationship(back_populates="embeddings")


class Alert(Base):
    __tablename__ = "alerts"
    alert_id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.person_id"), index=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.camera_id"))
    similarity: Mapped[float] = mapped_column(Float)
    snapshot_path: Mapped[str | None] = mapped_column(String(255), nullable=True)  # face crop
    frame_path: Mapped[str | None] = mapped_column(String(255), nullable=True)     # full camera frame
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[int | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    person: Mapped[Person] = relationship()
    camera: Mapped[Camera] = relationship()


class PeopleCount(Base):
    __tablename__ = "people_counts"
    count_id: Mapped[int] = mapped_column(primary_key=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.camera_id"), index=True)
    direction: Mapped[str] = mapped_column(String(3))  # in | out
    track_id: Mapped[str] = mapped_column(String(40))
    counted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
