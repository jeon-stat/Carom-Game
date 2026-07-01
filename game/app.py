from __future__ import annotations

import math
from dataclasses import dataclass

from direct.showbase.ShowBase import ShowBase
from direct.showbase.ShowBaseGlobal import globalClock
from panda3d.core import AmbientLight, DirectionalLight, NodePath, Point3, Vec3, loadPrcFileData

from game.camera_controller import CameraController
from game.config import GAME_CONFIG
from game.four_ball_rules import ShotOutcome
from game.input_controller import InputController
from game.modes import CameraMode, GameMode
from game.shot_controller import ShotController
from game.table_setup import build_ball_spawns
from game.ui import GameUI
from game.visuals import BallVisual, create_cue_visual, create_prediction_visual, create_table_visual, build_ball_visuals


loadPrcFileData("", "window-title Four Ball Carom Prototype")
loadPrcFileData("", "show-frame-rate-meter false")
loadPrcFileData("", "sync-video true")


@dataclass
class PlaybackState:
    result: object | None = None
    elapsed: float = 0.0
    total_duration: float = 0.0


class CaromApp(ShowBase):
    def __init__(self):
        super().__init__()
        self.disableMouse()
        self.win.setClearColor((0.03, 0.05, 0.06, 1.0))

        self.mode = GameMode.AIM
        self.view_mode = CameraMode.AIM
        self.current_player = 1
        self.scores = {1: 0, 2: 0}
        self.power = 0.52
        self.aim_heading = 0.0
        self.tip_x = 0.0
        self.tip_y = 0.0
        self.status_message = "Aim and shoot."

        self.shot_controller = ShotController(playback_dt=GAME_CONFIG.gameplay.playback_dt)
        self.camera_controller = CameraController()
        self.input_controller = InputController(self)
        self.ui = GameUI(self)
        self.playback = PlaybackState()

        self.scene_root = self.render.attachNewNode("scene-root")
        self.table_node = create_table_visual(self.loader, self.scene_root)
        self.ball_visuals = build_ball_visuals(
            self.loader,
            self.scene_root,
            build_ball_spawns_as_visuals(),
            GAME_CONFIG.table.ball_radius,
        )
        self.cue_visual = create_cue_visual(self.scene_root)
        self.prediction_visual = create_prediction_visual(self.scene_root)
        self.ball_nodes: dict[str, BallVisual] = self.ball_visuals

        self._register_lights()
        self._sync_visuals_to_system()
        self._register_camera()

        self.taskMgr.add(self._update_task, "update-task")

    def _register_lights(self) -> None:
        ambient = AmbientLight("ambient")
        ambient.setColor((0.5, 0.55, 0.6, 1))
        ambient_np = self.render.attachNewNode(ambient)
        self.render.setLight(ambient_np)

        sun = DirectionalLight("sun")
        sun.setColor((0.85, 0.82, 0.78, 1))
        sun_np = self.render.attachNewNode(sun)
        sun_np.setHpr(35, -55, 0)
        self.render.setLight(sun_np)

    def _register_camera(self) -> None:
        self.camera.setPos(0, -3.8, 2.2)
        self.camera.lookAt(Point3(0, 0, 0))

    def set_power(self, value: float, from_slider: bool = False) -> None:
        self.power = max(0.0, min(1.0, value))
        if not from_slider:
            self.ui.power_slider["value"] = self.power
        if self.mode == GameMode.AIM:
            self.mode = GameMode.STROKE

    @property
    def cue_ball_id(self) -> str:
        return self.shot_controller.current_cue_ball_id(self.current_player)

    @property
    def current_cue_ball_id(self) -> str:
        return self.cue_ball_id

    def _update_task(self, task):
        dt = float(globalClock.getDt())
        input_state = self.input_controller.consume()

        if input_state.quit_requested:
            self.userExit()
            return task.done

        if input_state.reset_requested:
            self._reset_table()

        if input_state.toggle_view_requested:
            self.view_mode = CameraMode.ORBIT if self.view_mode == CameraMode.AIM else CameraMode.AIM
            self.camera_controller.mode = self.view_mode

        self._apply_continuous_inputs(input_state, dt)
        self._update_modes(dt, input_state)
        self.ui.sync()
        return task.cont

    def _apply_continuous_inputs(self, input_state, dt: float) -> None:
        if self.mode not in {GameMode.AIM, GameMode.STROKE}:
            return

        yaw_delta = 0.0
        if input_state.aim_left:
            yaw_delta += 1.0
        if input_state.aim_right:
            yaw_delta -= 1.0

        if yaw_delta:
            self.aim_heading = (self.aim_heading + yaw_delta * GAME_CONFIG.gameplay.aim_step_degrees) % 360.0

        power_delta = 0.0
        if input_state.power_up:
            power_delta += 1.0
        if input_state.power_down:
            power_delta -= 1.0
        power_delta += input_state.mouse_wheel_delta

        if power_delta:
            self.set_power(self.power + power_delta * GAME_CONFIG.gameplay.power_step)
            if self.mode == GameMode.AIM:
                self.mode = GameMode.STROKE

    def _update_modes(self, dt: float, input_state) -> None:
        if self.mode in {GameMode.AIM, GameMode.STROKE}:
            if input_state.fire_requested:
                self._start_shot()
                return
            self._update_camera_and_cue(dt)
            self.status_message = "Aim mode" if self.mode == GameMode.AIM else "Stroke mode"
            return

        if self.mode == GameMode.SHOT:
            self.playback.elapsed += dt
            if self.playback.result is not None:
                self._apply_playback_sample(self.playback.elapsed, dt)
                if self.playback.elapsed >= self.playback.total_duration:
                    self._finish_shot()
            return

        if self.mode == GameMode.RESULT:
            self.playback.elapsed += dt
            if self.playback.elapsed >= GAME_CONFIG.gameplay.result_delay_seconds:
                self._advance_turn_after_result()
            return

    def _update_camera_and_cue(self, dt: float) -> None:
        cue_pos = self._cue_ball_position()
        self.camera_controller.mode = self.view_mode
        self.camera_controller.update(self.camera, cue_pos, self.aim_heading, dt)

        heading_rad = math.radians(self.aim_heading)
        forward = Vec3(math.sin(heading_rad), math.cos(heading_rad), 0.0)
        cue_back = GAME_CONFIG.camera.aim_distance * 0.55
        cue_pos_3d = Vec3(cue_pos.x, cue_pos.y, cue_pos.z)
        cue_root_pos = cue_pos_3d - forward * cue_back + Vec3(0.0, 0.0, GAME_CONFIG.table.ball_radius * 0.8)

        self.cue_visual.show()
        self.cue_visual.setPos(cue_root_pos)
        self.cue_visual.setHpr(self.aim_heading, 0, 0)
        self.cue_visual.setScale(1.0, 1.0, 1.0)

    def _start_shot(self) -> None:
        if self.mode not in {GameMode.AIM, GameMode.STROKE}:
            return

        self.mode = GameMode.SHOT
        self.status_message = "Shot running..."
        self.playback.elapsed = 0.0

        result = self.shot_controller.shoot(
            player_id=self.current_player,
            cue_ball_id=self.cue_ball_id,
            aim_yaw_degrees=self.aim_heading,
            power=self.power,
            tip_offset_x=self.tip_x,
            tip_offset_y=self.tip_y,
        )
        self.playback.result = result
        self.playback.total_duration = result.trajectory.duration

    def _finish_shot(self) -> None:
        if self.playback.result is None:
            return

        self._apply_playback_sample(self.playback.total_duration, 0.0)
        self.shot_controller.commit_latest_shot()
        result = self.playback.result
        assert isinstance(result, object)

        outcome: ShotOutcome = result.outcome
        if outcome.success:
            self.scores[self.current_player] += 1
            self.status_message = "Score!"
        else:
            self.status_message = "Turn ended."

        self.mode = GameMode.RESULT
        self.playback.elapsed = 0.0

    def _advance_turn_after_result(self) -> None:
        result = self.playback.result
        outcome = result.outcome if result is not None else None
        if outcome is None:
            self.mode = GameMode.AIM
            return

        if not outcome.success:
            self.current_player = 2 if self.current_player == 1 else 1

        self.mode = GameMode.AIM
        self.status_message = "Aim and shoot."
        self.playback.result = None
        self.playback.elapsed = 0.0
        self._sync_visuals_to_system()

    def _reset_table(self) -> None:
        self.shot_controller.reset()
        self.current_player = 1
        self.scores = {1: 0, 2: 0}
        self.power = 0.52
        self.aim_heading = 0.0
        self.tip_x = 0.0
        self.tip_y = 0.0
        self.mode = GameMode.AIM
        self.status_message = "Table reset."
        self.playback = PlaybackState()
        self._sync_visuals_to_system()
        self.camera_controller.mode = self.view_mode

    def _cue_ball_position(self) -> Point3:
        ball = self.shot_controller.system.balls[self.cue_ball_id]
        return Point3(float(ball.state.rvw[0][0]), float(ball.state.rvw[0][1]), float(ball.state.rvw[0][2]))

    def _sync_visuals_to_system(self) -> None:
        for ball_id, ball in self.shot_controller.system.balls.items():
            visual = self.ball_visuals[ball_id]
            visual.node.show()
            visual.node.setPos(
                float(ball.state.rvw[0][0]),
                float(ball.state.rvw[0][1]),
                float(ball.state.rvw[0][2]),
            )

        if self.mode == GameMode.SHOT:
            self.cue_visual.hide()
        else:
            self.cue_visual.show()

    def _apply_playback_sample(self, elapsed: float, dt: float) -> None:
        if self.playback.result is None:
            return

        trajectory = self.playback.result.trajectory
        if trajectory is None:
            return

        sample = trajectory.sample(min(elapsed, trajectory.duration))
        for ball_id, kinematics in sample.items():
            visual = self.ball_visuals.get(ball_id)
            if visual is None:
                continue
            visual.node.setPos(*kinematics.position)

        cue_ball = sample.get(self.cue_ball_id)
        if cue_ball is not None:
            cue_pos = Point3(*cue_ball.position)
            self.camera_controller.update(self.camera, cue_pos, self.aim_heading, dt)

    def run(self):  # type: ignore[override]
        super().run()


def build_ball_spawns_as_visuals():
    from game.table_setup import build_ball_spawns

    return [(spawn.ball_id, spawn.color) for spawn in build_ball_spawns()]


def main() -> None:
    app = CaromApp()
    app.run()
