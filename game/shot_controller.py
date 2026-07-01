from __future__ import annotations

from dataclasses import dataclass

from game.four_ball_rules import FourBallRules, ShotOutcome
from game.pooltool_adapter import ShotRequest, ShotTrajectory, simulate_shot
from game.table_setup import build_four_ball_system


@dataclass
class ShotResult:
    trajectory: ShotTrajectory
    outcome: ShotOutcome
    system_after: object


class ShotController:
    def __init__(self, playback_dt: float):
        self.playback_dt = playback_dt
        self.rules = FourBallRules()
        self.system = build_four_ball_system()
        self.latest_result: ShotResult | None = None

    def reset(self) -> None:
        self.system = build_four_ball_system()
        self.latest_result = None

    def current_cue_ball_id(self, player_id: int) -> str:
        return self.rules.cue_ball_for_player(player_id)

    def shoot(
        self,
        *,
        player_id: int,
        cue_ball_id: str,
        aim_yaw_degrees: float,
        power: float,
        tip_offset_x: float,
        tip_offset_y: float,
    ) -> ShotResult:
        request = ShotRequest(
            player_id=player_id,
            cue_ball_id=cue_ball_id,
            aim_yaw_degrees=aim_yaw_degrees,
            power=power,
            tip_offset_x=tip_offset_x,
            tip_offset_y=tip_offset_y,
        )
        system_after, trajectory = simulate_shot(self.system, request, self.playback_dt)
        outcome = self.rules.evaluate_shot(system_after.events, player_id)
        self.latest_result = ShotResult(
            trajectory=trajectory,
            outcome=outcome,
            system_after=system_after,
        )
        return self.latest_result

    def commit_latest_shot(self) -> None:
        if self.latest_result is None:
            return
        self.system = self.latest_result.system_after
        self.latest_result = None

