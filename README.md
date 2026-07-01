# Four Ball Carom Prototype

A Python-based 3D Korean-style four-ball carom prototype built around
`pooltool` for the physics layer and Panda3D for rendering, camera, and input.

## What this is

- 4 balls only:
  - white cue ball
  - yellow cue ball
  - red object ball 1
  - red object ball 2
- pocketless carom/billiards table
- local 1 PC, 2-player turn-based prototype
- simplified scoring and turn logic

## What this is not

- not Unity
- not a custom billiards physics engine
- not a networked multiplayer game
- not a polished commercial release

## Controls

- `A` / `D`: aim left and right
- `W` / `S`: power up and down
- mouse wheel: power adjustment
- `Space` or `Enter`: shoot
- `Tab`: toggle between aim camera and orbit camera
- `R`: reset table
- `Esc`: quit

## Install

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

The project depends on `pooltool-billiards` and Panda3D. If you already have a
local `pooltool` checkout for reference, you can keep it alongside the project,
but the runtime itself uses the packaged dependency.

## Run

```bash
python main.py
```

## Game rules

This prototype starts with a simplified four-ball rule set:

- Player 1 uses the white cue ball.
- Player 2 uses the yellow cue ball.
- A shot scores if the current cue ball legally contacts both red object balls.
- Hitting the opponent cue ball before both reds are contacted ends the turn.
- If the shot fails, the turn switches.
- If the shot succeeds, the same player continues.

The rule engine is intentionally small so it can be extended later with more
advanced four-ball, three-cushion, and foul logic.
