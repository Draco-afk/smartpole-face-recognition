"""Face matching with cosine similarity (Eq. 2.1 in the report)."""
import json
import math

from sqlalchemy.orm import Session

from .models import FaceEmbedding


def normalize(vec: list[float]) -> list[float]:
    n = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / n for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    # both vectors are stored L2-normalised, so the dot product is the cosine
    return sum(x * y for x, y in zip(a, b))


class EmbeddingIndex:
    """In-memory copy of the watchlist embeddings; rebuilt whenever enrolment changes."""

    def __init__(self):
        self._items: list[tuple[int, list[float]]] = []
        self.dirty = True

    def load(self, db: Session):
        self._items = [(e.person_id, json.loads(e.vector)) for e in db.query(FaceEmbedding).all()]
        self.dirty = False

    def best_match(self, db: Session, vec: list[float]) -> tuple[int | None, float]:
        if self.dirty:
            self.load(db)
        q = normalize(vec)
        best_id, best_sim = None, -1.0
        for person_id, ref in self._items:
            if len(ref) != len(q):
                continue
            s = cosine(q, ref)
            if s > best_sim:
                best_id, best_sim = person_id, s
        return best_id, best_sim


index = EmbeddingIndex()
