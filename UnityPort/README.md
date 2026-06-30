# Unity Frontend + pooltool Backend

This folder contains a minimal prototype where Unity is only the renderer/input
frontend and Python `pooltool` is the physics backend.

## Structure

### Unity

- `Assets/Scripts/Pooltool/ShotRequest.cs`
- `Assets/Scripts/Pooltool/ShotTrajectory.cs`
- `Assets/Scripts/Pooltool/PooltoolBallView.cs`
- `Assets/Scripts/Pooltool/PooltoolClient.cs`
- `Assets/Scripts/Pooltool/TrajectoryPlaybackManager.cs`
- `Assets/Scripts/Pooltool/AimingController.cs`

### Python

- `PythonBackend/simulate_shot.py`
- `PythonBackend/pooltool_adapter.py`
- `PythonBackend/requirements.txt`

## Data Flow

1. `AimingController` chooses cue direction and power.
2. `TrajectoryPlaybackManager` collects the current scene balls into a
   `PooltoolShotRequest`.
3. `PooltoolClient` launches Python and sends the request JSON.
4. `pooltool_adapter.py` builds a `pooltool.System` and simulates the shot.
5. Python returns a trajectory JSON with time-resolved ball state.
6. `TrajectoryPlaybackManager` replays the returned samples on Unity transforms.

## Coordinate Mapping

The JSON uses Unity coordinates:

- `position.x` = Unity X
- `position.y` = Unity Y
- `position.z` = Unity Z

Python converts this to the `pooltool` table plane and back again on output.

## Runtime Notes

- Unity `Rigidbody` is not used for physics.
- If a `PooltoolBallView` has a Rigidbody, it is locked as kinematic and used only
  as a visual anchor.
- `Assets/Scripts/Physics` is legacy custom physics and is no longer the target
  runtime path for this prototype.

## Python Requirements

`PythonBackend/requirements.txt` currently pins the `pooltool-billiards` package.

For local development against the repository clone, either:

- set `POOLTOOL_SOURCE_ROOT` to the local clone path, or
- pass `--pooltool-root` to `PythonBackend/simulate_shot.py`.

## Minimal Prototype Goal

The first milestone is an end-to-end shot with one cue ball or a simple two-ball
setup:

- cue direction
- cue power
- tip offset
- shot request JSON
- Python trajectory JSON
- Unity playback

Once this path is stable, we can expand the UI, add validation, and make the
backend call asynchronous or remote.

## Scene Setup

1. Add `PooltoolBallView` to the cue ball and any object balls.
2. Add `TrajectoryPlaybackManager` to a scene object.
3. Add `PooltoolClient` to the same object or another manager object.
4. Add `AimingController` and wire its `PooltoolClient` and
   `TrajectoryPlaybackManager` references.
5. Install the Python requirements.
6. Press `Space` in Unity to send the current shot to Python and replay the
   returned trajectory.
