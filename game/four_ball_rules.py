from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ShotOutcome:
    success: bool
    first_contact: str | None
    touched_reds: tuple[str, ...] = field(default_factory=tuple)
    illegal_first_contact: bool = False
    notes: tuple[str, ...] = field(default_factory=tuple)


class FourBallRules:
    cue_by_player = {1: "white", 2: "yellow"}
    red_balls = ("red1", "red2")

    def cue_ball_for_player(self, player_id: int) -> str:
        return self.cue_by_player[player_id]

    def evaluate_shot(self, events, player_id: int) -> ShotOutcome:
        cue_ball_id = self.cue_ball_for_player(player_id)
        opponent_ball_id = self.cue_ball_for_player(2 if player_id == 1 else 1)

        touched_reds: list[str] = []
        first_contact: str | None = None
        illegal_first_contact = False
        notes: list[str] = []

        cue_contacts = []
        for event in sorted(events, key=lambda item: float(getattr(item, "time", 0.0))):
            event_type = getattr(event, "event_type", None)
            if getattr(event_type, "name", str(event_type)) != "BALL_BALL":
                continue

            agent_ids = tuple(getattr(agent, "id", "") for agent in getattr(event, "agents", ()))
            if cue_ball_id not in agent_ids:
                continue

            other = next((ball_id for ball_id in agent_ids if ball_id != cue_ball_id), None)
            if other is None:
                continue

            cue_contacts.append(other)
            if first_contact is None:
                first_contact = other
                if other == opponent_ball_id:
                    illegal_first_contact = True
                    notes.append("Opponent cue ball was contacted first.")

            if other in self.red_balls and other not in touched_reds:
                touched_reds.append(other)
            elif other == opponent_ball_id and len(touched_reds) < len(self.red_balls):
                illegal_first_contact = True

        success = (
            len(touched_reds) == len(self.red_balls)
            and not illegal_first_contact
            and first_contact is not None
        )

        if success:
            notes.append("Both red balls were contacted by the active cue ball.")
        else:
            if len(touched_reds) != len(self.red_balls):
                notes.append("The active cue ball did not contact both red balls.")
            if first_contact is None:
                notes.append("No cue-ball collision was detected.")

        return ShotOutcome(
            success=success,
            first_contact=first_contact,
            touched_reds=tuple(touched_reds),
            illegal_first_contact=illegal_first_contact,
            notes=tuple(notes),
        )

