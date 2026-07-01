from __future__ import annotations

import os
from pathlib import Path


def _configure_pooltool_home() -> None:
    workspace_home = Path(__file__).resolve().parent / ".pooltool-home"
    workspace_home.mkdir(parents=True, exist_ok=True)
    os.environ["HOME"] = str(workspace_home)
    os.environ["USERPROFILE"] = str(workspace_home)
    os.environ["XDG_CONFIG_HOME"] = str(workspace_home / ".config")


_configure_pooltool_home()

from game.app import main


if __name__ == "__main__":
    main()
