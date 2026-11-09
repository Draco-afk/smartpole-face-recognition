"""Latest video frame per camera, kept in memory and fanned out to viewers."""
import time
from dataclasses import dataclass


@dataclass
class Frame:
    seq: int
    jpeg: bytes
    at: float  # time.time() when received


class FrameStore:
    def __init__(self):
        self._frames: dict[int, Frame] = {}

    def put(self, camera_id: int, jpeg: bytes) -> None:
        prev = self._frames.get(camera_id)
        self._frames[camera_id] = Frame(prev.seq + 1 if prev else 1, jpeg, time.time())

    def get(self, camera_id: int) -> Frame | None:
        return self._frames.get(camera_id)

    def age(self, camera_id: int) -> float | None:
        f = self._frames.get(camera_id)
        return time.time() - f.at if f else None


frames = FrameStore()
