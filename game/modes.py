from __future__ import annotations

from enum import Enum, auto


class GameMode(Enum):
    AIM = auto()
    STROKE = auto()
    SHOT = auto()
    RESULT = auto()


class CameraMode(Enum):
    AIM = auto()
    ORBIT = auto()

