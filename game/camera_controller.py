from __future__ import annotations

import math

from panda3d.core import Point3, Vec3

from game.config import GAME_CONFIG
from game.modes import CameraMode


class CameraController:
    def __init__(self):
        self.mode = CameraMode.AIM
        self.follow_focus = Point3(0, 0, 0)

    def toggle_mode(self) -> None:
        self.mode = CameraMode.ORBIT if self.mode == CameraMode.AIM else CameraMode.AIM

    def update(self, camera, cue_ball_pos: Point3, aim_heading_degrees: float, dt: float) -> None:
        if self.mode == CameraMode.ORBIT:
            self._update_orbit(camera, cue_ball_pos, dt)
            return
        self._update_aim(camera, cue_ball_pos, aim_heading_degrees, dt)

    def _update_aim(self, camera, cue_ball_pos: Point3, aim_heading_degrees: float, dt: float) -> None:
        cfg = GAME_CONFIG.camera
        heading = math.radians(aim_heading_degrees)
        forward = Vec3(math.sin(heading), math.cos(heading), 0.0)
        desired_pos = cue_ball_pos - forward * cfg.aim_distance + Vec3(0.0, 0.0, cfg.aim_height)
        self._smooth_move(camera, desired_pos, cue_ball_pos + forward * cfg.aim_look_ahead, dt)

    def _update_orbit(self, camera, cue_ball_pos: Point3, dt: float) -> None:
        cfg = GAME_CONFIG.camera
        desired_pos = cue_ball_pos + Vec3(-cfg.orbit_distance * 0.35, -cfg.orbit_distance, cfg.orbit_height)
        self._smooth_move(camera, desired_pos, cue_ball_pos, dt)

    def _smooth_move(self, camera, desired_pos: Point3, focus: Point3, dt: float) -> None:
        cfg = GAME_CONFIG.camera
        current_pos = camera.getPos()
        alpha = max(0.0, min(1.0, cfg.smoothing * dt))
        new_pos = current_pos + (desired_pos - current_pos) * alpha
        camera.setPos(new_pos)
        camera.lookAt(focus)

