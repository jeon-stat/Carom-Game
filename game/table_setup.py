from __future__ import annotations

from dataclasses import dataclass

import numpy as np

try:
    import pooltool as pt
except Exception as exc:  # pragma: no cover - runtime dependency guard
    pt = None
    _POOLTOOL_IMPORT_ERROR = exc


def _require_pooltool() -> None:
    if pt is None:  # pragma: no cover - runtime dependency guard
        raise RuntimeError(
            "pooltool is required. Install dependencies with `pip install -r requirements.txt`."
        ) from _POOLTOOL_IMPORT_ERROR


@dataclass(frozen=True)
class BallSpawn:
    ball_id: str
    color: tuple[float, float, float]
    home_xy: tuple[float, float]


def build_ball_spawns() -> list[BallSpawn]:
    return [
        BallSpawn("white", (0.95, 0.94, 0.90), (-0.92, 0.00)),
        BallSpawn("yellow", (0.93, 0.79, 0.16), (0.80, 0.24)),
        BallSpawn("red1", (0.70, 0.07, 0.11), (0.94, -0.04)),
        BallSpawn("red2", (0.78, 0.11, 0.14), (0.78, -0.24)),
    ]


def build_four_ball_system():
    _require_pooltool()

    ball_params = pt.BallParams.default(pt.GameType.THREECUSHION)
    table = pt.Table.default(pt.TableType.BILLIARD)

    balls: dict[str, object] = {}
    for spawn in build_ball_spawns():
        ball = pt.Ball(id=spawn.ball_id, params=ball_params)
        ball.state.rvw[0] = np.array(
            [spawn.home_xy[0], spawn.home_xy[1], ball_params.R],
            dtype=np.float64,
        )
        ball.state.rvw[1] = np.array([0.0, 0.0, 0.0], dtype=np.float64)
        ball.state.rvw[2] = np.array([0.0, 0.0, 0.0], dtype=np.float64)
        balls[spawn.ball_id] = ball

    cue = pt.Cue.default()
    cue.cue_ball_id = "white"
    system = pt.System(cue=cue, table=table, balls=balls)
    return system


def get_ball_colors() -> list[tuple[str, tuple[float, float, float]]]:
    return [(spawn.ball_id, spawn.color) for spawn in build_ball_spawns()]
