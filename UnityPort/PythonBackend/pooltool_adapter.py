from __future__ import annotations

import importlib.metadata
import json
import math
import os
import sys
from pathlib import Path
from typing import Any

import numpy as np


POOLTOOL_DISTRIBUTION_NAME = "pooltool-billiards"
STATE_NAMES = {
    0: "stationary",
    1: "spinning",
    2: "sliding",
    3: "rolling",
    4: "pocketed",
    5: "airborne",
}


def _find_local_pooltool_root() -> Path | None:
    env_root = os.environ.get("POOLTOOL_SOURCE_ROOT")
    if env_root:
        root = Path(env_root).expanduser().resolve()
        if root.exists():
            return root

    repo_root = Path(__file__).resolve().parents[2]
    local_root = repo_root / "_pooltool"
    if local_root.exists():
        return local_root

    return None


def _patch_missing_distribution_version() -> None:
    try:
        importlib.metadata.version(POOLTOOL_DISTRIBUTION_NAME)
    except importlib.metadata.PackageNotFoundError:
        original_version = importlib.metadata.version

        def version(name: str) -> str:
            if name == POOLTOOL_DISTRIBUTION_NAME:
                return "0.0.0-local"
            return original_version(name)

        importlib.metadata.version = version  # type: ignore[assignment]


def load_pooltool():
    local_root = _find_local_pooltool_root()
    if local_root is not None:
        sys.path.insert(0, str(local_root))

    _patch_missing_distribution_version()

    import pooltool as pt  # noqa: WPS433 - imported after path setup on purpose

    return pt


def _vec3_from_unity(data: dict[str, Any] | None, default_z: float = 0.0) -> np.ndarray:
    data = data or {}
    return np.array(
        [
            float(data.get("x", 0.0)),
            float(data.get("z", 0.0)),
            float(data.get("y", default_z)),
        ],
        dtype=np.float64,
    )


def _vec3_to_unity(vector: np.ndarray) -> dict[str, float]:
    return {
        "x": float(vector[0]),
        "y": float(vector[2]),
        "z": float(vector[1]),
    }


def _quat_mul(lhs: np.ndarray, rhs: np.ndarray) -> np.ndarray:
    lx, ly, lz, lw = lhs
    rx, ry, rz, rw = rhs
    return np.array(
        [
            lw * rx + lx * rw + ly * rz - lz * ry,
            lw * ry - lx * rz + ly * rw + lz * rx,
            lw * rz + lx * ry - ly * rx + lz * rw,
            lw * rw - lx * rx - ly * ry - lz * rz,
        ],
        dtype=np.float64,
    )


def _quat_from_axis_angle(axis: np.ndarray, angle: float) -> np.ndarray:
    if angle <= 1e-12:
        return np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float64)

    norm = float(np.linalg.norm(axis))
    if norm <= 1e-12:
        return np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float64)

    unit = axis / norm
    half = angle * 0.5
    sin_half = math.sin(half)
    return np.array(
        [
            float(unit[0] * sin_half),
            float(unit[1] * sin_half),
            float(unit[2] * sin_half),
            float(math.cos(half)),
        ],
        dtype=np.float64,
    )


def _integrate_rotation_series(angular_velocities: np.ndarray, timestamps: np.ndarray) -> np.ndarray:
    if len(timestamps) == 0:
        return np.empty((0, 4), dtype=np.float64)

    rotations = np.empty((len(timestamps), 4), dtype=np.float64)
    rotations[0] = np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float64)

    for i in range(1, len(timestamps)):
        dt = max(0.0, float(timestamps[i] - timestamps[i - 1]))
        delta = _quat_from_axis_angle(angular_velocities[i], float(np.linalg.norm(angular_velocities[i])) * dt)
        rotations[i] = _quat_mul(rotations[i - 1], delta)

        length = float(np.linalg.norm(rotations[i]))
        if length > 1e-12:
            rotations[i] /= length

    return rotations


def _build_table(pt, request: dict[str, Any]):
    from pooltool.objects.table.specs import (
        BilliardTableSpecs,
        PocketTableSpecs,
        SnookerTableSpecs,
    )

    table_data = request.get("table", {}) or {}
    table_type = str(table_data.get("tableType", "pocket")).lower()
    length = float(table_data.get("length", 1.9812))
    width = float(table_data.get("width", 0.9906))
    height = float(table_data.get("height", 0.708))
    pocket_radius = float(table_data.get("pocketRadius", 0.062))

    if table_type == "billiard":
        specs = BilliardTableSpecs(l=length, w=width, height=height)
    elif table_type == "snooker":
        specs = SnookerTableSpecs(l=length, w=width, height=height)
    else:
        specs = PocketTableSpecs(
            l=length,
            w=width,
            height=height,
            corner_pocket_radius=pocket_radius,
            side_pocket_radius=pocket_radius,
        )

    return pt.Table.from_table_specs(specs)


def _build_balls(pt, request: dict[str, Any]) -> dict[str, Any]:
    ball_requests = request.get("balls", []) or []
    if not ball_requests:
        raise ValueError("The shot request must contain at least one ball.")

    first_ball = ball_requests[0]
    radius = float(first_ball.get("radius", 0.028575))
    mass = float(first_ball.get("mass", 0.170097))

    balls: dict[str, Any] = {}
    for ball_data in ball_requests:
        ball_id = str(ball_data.get("ballId", "ball"))
        position = _vec3_from_unity(ball_data.get("position"), default_z=radius)
        velocity = _vec3_from_unity(ball_data.get("velocity"))
        angular_velocity = _vec3_from_unity(ball_data.get("angularVelocity"))

        ball = pt.Ball.create(ball_id, xy=(float(position[0]), float(position[1])), m=mass, R=radius)
        ball.state.rvw[0] = np.array(
            [float(position[0]), float(position[1]), max(radius, float(position[2]))],
            dtype=np.float64,
        )
        ball.state.rvw[1] = velocity
        ball.state.rvw[2] = angular_velocity

        planar_speed = float(np.linalg.norm(velocity[:2]))
        spin_speed = float(np.linalg.norm(angular_velocity))
        if planar_speed > 1e-8:
            ball.state.s = pt.constants.sliding
        elif spin_speed > 1e-8:
            ball.state.s = pt.constants.spinning
        else:
            ball.state.s = pt.constants.stationary

        balls[ball.id] = ball

    return balls


def _compute_phi(direction: dict[str, Any]) -> float:
    x = float(direction.get("x", 0.0))
    z = float(direction.get("z", 0.0))
    if abs(x) < 1e-12 and abs(z) < 1e-12:
        x = 1.0
    return float(math.degrees(math.atan2(z, x)) % 360.0)


def build_system_from_request(pt, request: dict[str, Any]):
    table = _build_table(pt, request)
    balls = _build_balls(pt, request)

    cue_data = request.get("cue", {}) or {}
    cue_ball_id = str(request.get("cueBallId", "cue"))
    if cue_ball_id not in balls:
        raise ValueError(f"Cue ball '{cue_ball_id}' was not present in the request.")

    cue = pt.Cue.default()
    cue.cue_ball_id = cue_ball_id
    cue.V0 = max(0.0, float(cue_data.get("speed", 2.0)))
    cue.phi = _compute_phi(cue_data.get("direction", {}) or {})
    cue.theta = float(cue_data.get("elevation", 0.0))
    cue.a = float(np.clip(float(cue_data.get("tipOffset", {}).get("x", 0.0)), -1.0, 1.0))
    cue.b = float(np.clip(float(cue_data.get("tipOffset", {}).get("y", 0.0)), -1.0, 1.0))

    system = pt.System(cue=cue, table=table, balls=balls)
    return system


def _ball_state_label(state_index: int) -> str:
    return STATE_NAMES.get(int(state_index), "stationary")


def _trajectory_from_ball(ball) -> dict[str, Any]:
    if ball.history_cts.empty:
        history = ball.history
    else:
        history = ball.history_cts

    rvws, states, timestamps = history.vectorize()
    positions = rvws[:, 0, :]
    velocities = rvws[:, 1, :]
    angular_velocities = rvws[:, 2, :]
    rotations = _integrate_rotation_series(angular_velocities, timestamps)

    samples = []
    for index in range(len(timestamps)):
        samples.append(
            {
                "time": float(timestamps[index]),
                "position": _vec3_to_unity(positions[index]),
                "velocity": _vec3_to_unity(velocities[index]),
                "angularVelocity": _vec3_to_unity(angular_velocities[index]),
                "rotation": {
                    "x": float(rotations[index][0]),
                    "y": float(rotations[index][1]),
                    "z": float(rotations[index][2]),
                    "w": float(rotations[index][3]),
                },
                "motionState": _ball_state_label(states[index]),
                "pocketed": int(states[index]) == 4,
            }
        )

    return {
        "ballId": ball.id,
        "radius": float(ball.params.R),
        "mass": float(ball.params.m),
        "samples": samples,
    }


def simulate_request(request: dict[str, Any]) -> dict[str, Any]:
    pt = load_pooltool()
    system = build_system_from_request(pt, request)

    sample_dt = float(request.get("sampleDeltaTime", 0.01))
    max_time = float(request.get("maxSimulationTime", 0.0))
    t_final = max_time if max_time > 0.0 else None

    simulated = pt.simulate(
        system,
        continuous=True,
        dt=sample_dt,
        inplace=False,
        t_final=t_final,
    )

    balls = [_trajectory_from_ball(ball) for ball in simulated.balls.values()]
    balls.sort(key=lambda item: item["ballId"])

    return {
        "shotId": str(request.get("shotId", "")),
        "sampleDeltaTime": sample_dt,
        "duration": float(simulated.t),
        "backend": "pooltool",
        "balls": balls,
    }


def main(argv: list[str] | None = None) -> int:
    _ = argv
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("No JSON request was provided on stdin.")

    request = json.loads(raw)
    response = simulate_request(request)
    json.dump(response, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
