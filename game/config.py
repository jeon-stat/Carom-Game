from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TableConfig:
    length: float = 2.84
    width: float = 1.42
    ball_radius: float = 0.03075
    rail_height: float = 0.037
    rail_thickness: float = 0.07
    cloth_color: tuple[float, float, float] = (0.08, 0.38, 0.28)
    rail_color: tuple[float, float, float] = (0.30, 0.18, 0.09)
    felt_border_color: tuple[float, float, float] = (0.05, 0.12, 0.08)


@dataclass(frozen=True)
class CameraConfig:
    aim_distance: float = 1.65
    aim_height: float = 0.82
    aim_look_ahead: float = 0.72
    orbit_distance: float = 3.45
    orbit_height: float = 2.05
    smoothing: float = 7.5


@dataclass(frozen=True)
class GameplayConfig:
    playback_dt: float = 1 / 120
    min_power_speed: float = 0.8
    max_power_speed: float = 4.4
    aim_step_degrees: float = 1.5
    power_step: float = 0.04
    power_mouse_wheel_step: float = 0.05
    result_delay_seconds: float = 1.25
    tip_offset_limit: float = 0.38


@dataclass(frozen=True)
class UiConfig:
    top_left_x: float = -1.28
    top_left_y: float = 0.95
    line_spacing: float = 0.06
    status_scale: float = 0.05
    hint_scale: float = 0.042


@dataclass(frozen=True)
class GameConfig:
    table: TableConfig = field(default_factory=TableConfig)
    camera: CameraConfig = field(default_factory=CameraConfig)
    gameplay: GameplayConfig = field(default_factory=GameplayConfig)
    ui: UiConfig = field(default_factory=UiConfig)
    title: str = "Four Ball Carom Prototype"


GAME_CONFIG = GameConfig()

