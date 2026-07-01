from __future__ import annotations

from dataclasses import dataclass


@dataclass
class InputState:
    aim_left: bool = False
    aim_right: bool = False
    power_up: bool = False
    power_down: bool = False
    fire_requested: bool = False
    reset_requested: bool = False
    toggle_view_requested: bool = False
    quit_requested: bool = False
    mouse_wheel_delta: float = 0.0


class InputController:
    def __init__(self, app):
        self.app = app
        self.state = InputState()
        self._bind()

    def _bind(self) -> None:
        bind = self.app.accept
        bind("a", self._set_flag, ["aim_left", True])
        bind("a-up", self._set_flag, ["aim_left", False])
        bind("left", self._set_flag, ["aim_left", True])
        bind("left-up", self._set_flag, ["aim_left", False])

        bind("d", self._set_flag, ["aim_right", True])
        bind("d-up", self._set_flag, ["aim_right", False])
        bind("right", self._set_flag, ["aim_right", True])
        bind("right-up", self._set_flag, ["aim_right", False])

        bind("w", self._set_flag, ["power_up", True])
        bind("w-up", self._set_flag, ["power_up", False])
        bind("up", self._set_flag, ["power_up", True])
        bind("up-up", self._set_flag, ["power_up", False])

        bind("s", self._set_flag, ["power_down", True])
        bind("s-up", self._set_flag, ["power_down", False])
        bind("down", self._set_flag, ["power_down", True])
        bind("down-up", self._set_flag, ["power_down", False])

        bind("space", self._set_one_shot, ["fire_requested"])
        bind("enter", self._set_one_shot, ["fire_requested"])
        bind("r", self._set_one_shot, ["reset_requested"])
        bind("tab", self._set_one_shot, ["toggle_view_requested"])
        bind("escape", self._set_one_shot, ["quit_requested"])
        bind("wheel_up", self._add_wheel_delta, [1.0])
        bind("wheel_down", self._add_wheel_delta, [-1.0])

    def _set_flag(self, name: str, value: bool) -> None:
        setattr(self.state, name, value)

    def _set_one_shot(self, name: str) -> None:
        setattr(self.state, name, True)

    def _add_wheel_delta(self, amount: float) -> None:
        self.state.mouse_wheel_delta += amount

    def consume(self) -> InputState:
        state = InputState(**self.state.__dict__)
        self.state.fire_requested = False
        self.state.reset_requested = False
        self.state.toggle_view_requested = False
        self.state.quit_requested = False
        self.state.mouse_wheel_delta = 0.0
        return state

