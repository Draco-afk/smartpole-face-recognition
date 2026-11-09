"""Deterministic stand-in face vectors, used only by seed.py and simulator.py for the demo.
The real system replaces these with vectors from the trained recognition model."""
import random

DIM = 512


def person_vector(person_id: int) -> list[float]:
    rng = random.Random(f"person-{person_id}")
    return [rng.gauss(0, 1) for _ in range(DIM)]


def noisy(vec: list[float], noise: float, rng: random.Random) -> list[float]:
    return [v + rng.gauss(0, noise) for v in vec]


def random_face(rng: random.Random) -> list[float]:
    return [rng.gauss(0, 1) for _ in range(DIM)]
