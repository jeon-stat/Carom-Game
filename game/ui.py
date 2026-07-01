from __future__ import annotations

from direct.gui.DirectGui import DirectSlider
from direct.gui.OnscreenText import OnscreenText

from game.config import GAME_CONFIG


class GameUI:
    def __init__(self, app):
        self.app = app
        ui_cfg = GAME_CONFIG.ui

        self.title = OnscreenText(
            text="Four Ball Carom",
            pos=(ui_cfg.top_left_x, ui_cfg.top_left_y),
            scale=ui_cfg.status_scale * 1.15,
            fg=(1, 1, 1, 1),
            mayChange=True,
            align=0,
            parent=app.aspect2d,
            shadow=(0, 0, 0, 0.4),
        )
        self.mode = self._make_text(0)
        self.player = self._make_text(1)
        self.score = self._make_text(2)
        self.power = self._make_text(3)
        self.status = self._make_text(4)
        self.hint = OnscreenText(
            text="A/D aim | W/S power | Space shoot | Tab camera | R reset | Esc quit",
            pos=(ui_cfg.top_left_x, -0.86),
            scale=ui_cfg.hint_scale,
            fg=(0.92, 0.92, 0.92, 1),
            mayChange=True,
            align=0,
            parent=app.aspect2d,
            shadow=(0, 0, 0, 0.35),
        )

        self.power_slider = DirectSlider(
            range=(0.0, 1.0),
            value=0.5,
            pageSize=0.01,
            pos=(0, 0, -0.92),
            scale=0.42,
            relief=1,
            frameColor=(0.1, 0.1, 0.1, 0.75),
            thumb_frameColor=(1.0, 0.5, 0.2, 1.0),
            command=self._on_power_change,
        )

    def _make_text(self, line_index: int) -> OnscreenText:
        ui_cfg = GAME_CONFIG.ui
        return OnscreenText(
            text="",
            pos=(ui_cfg.top_left_x, ui_cfg.top_left_y - (line_index + 1) * ui_cfg.line_spacing),
            scale=ui_cfg.status_scale,
            fg=(0.94, 0.96, 0.97, 1),
            mayChange=True,
            align=0,
            parent=self.app.aspect2d,
            shadow=(0, 0, 0, 0.35),
        )

    def _on_power_change(self, value: float | None = None) -> None:
        if value is None:
            value = float(self.power_slider["value"])
        self.app.set_power(float(value), from_slider=True)

    def sync(self) -> None:
        self.mode.setText(f"Mode: {self.app.mode.name}")
        self.player.setText(
            f"Player: {self.app.current_player}    Cue ball: {self.app.current_cue_ball_id}"
        )
        self.score.setText(
            f"Score  P1: {self.app.scores[1]}    P2: {self.app.scores[2]}"
        )
        self.power.setText(f"Power: {self.app.power:.2f}")
        self.status.setText(self.app.status_message)
        if abs(float(self.power_slider["value"]) - self.app.power) > 1e-4:
            self.power_slider["value"] = self.app.power
