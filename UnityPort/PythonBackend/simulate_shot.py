from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pooltool_adapter import simulate_request


def _read_text(path: Path | None) -> str:
    if path is None:
        return sys.stdin.read()
    return path.read_text(encoding="utf-8")


def _write_text(path: Path | None, text: str) -> None:
    if path is None:
        sys.stdout.write(text)
        sys.stdout.write("\n")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a pooltool shot simulation.")
    parser.add_argument("--input", type=Path, help="Path to a request JSON file.")
    parser.add_argument("--output", type=Path, help="Path to write the response JSON.")
    parser.add_argument(
        "--pooltool-root",
        type=Path,
        help="Optional local pooltool source clone. Defaults to the POOLTOOL_SOURCE_ROOT env var or the installed package.",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON.")
    args = parser.parse_args(argv)

    if args.pooltool_root is not None:
        import os

        os.environ["POOLTOOL_SOURCE_ROOT"] = str(args.pooltool_root)

    request = json.loads(_read_text(args.input))
    response = simulate_request(request)

    if args.pretty:
        output = json.dumps(response, indent=2)
    else:
        output = json.dumps(response, separators=(",", ":"))

    _write_text(args.output, output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
