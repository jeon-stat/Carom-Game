# pooltool Python Backend

This folder contains the thin adapter that turns Unity shot JSON into a `pooltool`
simulation and returns a trajectory JSON.

## Install

```bash
pip install -r requirements.txt
```

If you want to run against a local source clone instead of the installed package,
set `POOLTOOL_SOURCE_ROOT` to the clone path.

## Run

```bash
python simulate_shot.py < request.json > response.json
```

Or use explicit files:

```bash
python simulate_shot.py --input request.json --output response.json
```

## Notes

- Input and output use Unity-style coordinates.
- The adapter converts those coordinates to `pooltool` coordinates internally.
- Only the `pooltool` package is responsible for the physics; Unity only replays
  the returned samples.
