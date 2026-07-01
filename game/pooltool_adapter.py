from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from typing import Any

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
class ShotRequest:
    player_id: int
    cue_ball_id: str
    aim_yaw_degrees: float
    power: float
    tip_offset_x: float
    tip_offset_y: float
    elevation_degrees: float = 0.0


@dataclass(frozen=True)
class BallTrack:
    times: tuple[float, ...]
    positions: tuple[tuple[float, float, float], ...]
    velocities: tuple[tuple[float, float, float], ...]
    angular_velocities: tuple[tuple[float, float, float], ...]
    states: tuple[int, ...]

    def sample(self, t: float) -> "BallKinematics":
        if not self.times:
            return BallKinematics.zero()

        if t <= self.times[0]:
            return BallKinematics(
                position=self.positions[0],
                velocity=self.velocities[0],
                angular_velocity=self.angular_velocities[0],
                state=self.states[0],
            )

        if t >= self.times[-1]:
            return BallKinematics(
                position=self.positions[-1],
                velocity=self.velocities[-1],
                angular_velocity=self.angular_velocities[-1],
                state=self.states[-1],
            )

        idx = bisect_right(self.times, t) - 1
        next_idx = min(idx + 1, len(self.times) - 1)
        t0 = self.times[idx]
        t1 = self.times[next_idx]
        if t1 <= t0:
            return BallKinematics(
                position=self.positions[idx],
                velocity=self.velocities[idx],
                angular_velocity=self.angular_velocities[idx],
                state=self.states[idx],
            )

        alpha = (t - t0) / (t1 - t0)
        return BallKinematics(
            position=_lerp3(self.positions[idx], self.positions[next_idx], alpha),
            velocity=_lerp3(self.velocities[idx], self.velocities[next_idx], alpha),
            angular_velocity=_lerp3(
                self.angular_velocities[idx],
                self.angular_velocities[next_idx],
                alpha,
            ),
            state=self.states[idx],
        )


@dataclass(frozen=True)
class BallKinematics:
    position: tuple[float, float, float]
    velocity: tuple[float, float, float]
    angular_velocity: tuple[float, float, float]
    state: int

    @staticmethod
    def zero() -> "BallKinematics":
        return BallKinematics(
            position=(0.0, 0.0, 0.0),
            velocity=(0.0, 0.0, 0.0),
            angular_velocity=(0.0, 0.0, 0.0),
            state=0,
        )


@dataclass(frozen=True)
class ShotTrajectory:
    tracks: dict[str, BallTrack]
    events: tuple[dict[str, Any], ...]
    duration: float

    def sample(self, t: float) -> dict[str, BallKinematics]:
        return {ball_id: track.sample(t) for ball_id, track in self.tracks.items()}

    def is_finished(self, t: float) -> bool:
        return t >= self.duration

    @classmethod
    def from_system(cls, system) -> "ShotTrajectory":
        _require_pooltool()

        tracks: dict[str, BallTrack] = {}
        duration = 0.0
        for ball_id, ball in system.balls.items():
            history = ball.history_cts if len(ball.history_cts) else ball.history
            states = list(history.states)
            if not states:
                states = [ball.state]

            times = tuple(float(state.t) for state in states)
            positions = tuple(_vec3(state.rvw[0]) for state in states)
            velocities = tuple(_vec3(state.rvw[1]) for state in states)
            angular_velocities = tuple(_vec3(state.rvw[2]) for state in states)
            motion_states = tuple(int(state.s) for state in states)
            if times:
                duration = max(duration, times[-1])

            tracks[ball_id] = BallTrack(
                times=times,
                positions=positions,
                velocities=velocities,
                angular_velocities=angular_velocities,
                states=motion_states,
            )

        events = tuple(
            {
                "time": float(getattr(event, "time", 0.0)),
                "type": getattr(getattr(event, "event_type", None), "name", "UNKNOWN"),
                "agents": [getattr(agent, "id", "") for agent in getattr(event, "agents", ())],
            }
            for event in getattr(system, "events", [])
        )
        return ShotTrajectory(tracks=tracks, events=events, duration=duration)


def simulate_shot(system, request: ShotRequest, playback_dt: float):
    _require_pooltool()

    simulated = system.copy()
    cue = simulated.cue
    phi = (90.0 - request.aim_yaw_degrees) % 360.0
    cue.set_state(
        V0=_power_to_speed(request.power),
        phi=phi,
        theta=request.elevation_degrees,
        a=_clamp(request.tip_offset_x, -1.0, 1.0),
        b=_clamp(request.tip_offset_y, -1.0, 1.0),
    )
    simulated.cue = cue
    result = pt.simulate(
        simulated,
        inplace=True,
        continuous=True,
        dt=playback_dt,
    )
    return result, ShotTrajectory.from_system(result)


def _power_to_speed(power: float) -> float:
    from game.config import GAME_CONFIG

    gameplay = GAME_CONFIG.gameplay
    clamped = _clamp(power, 0.0, 1.0)
    return gameplay.min_power_speed + clamped * (gameplay.max_power_speed - gameplay.min_power_speed)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _lerp3(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    alpha: float,
) -> tuple[float, float, float]:
    return (
        start[0] + (end[0] - start[0]) * alpha,
        start[1] + (end[1] - start[1]) * alpha,
        start[2] + (end[2] - start[2]) * alpha,
    )


def _vec3(values) -> tuple[float, float, float]:
    array = np.asarray(values, dtype=np.float64).reshape(-1)
    return (float(array[0]), float(array[1]), float(array[2]))
