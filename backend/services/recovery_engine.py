"""
recovery_engine.py — Recovery Engine

Tracks per-session pushback state in memory (no MySQL writes during live interview).
When a candidate corrects a challenged mistake, awards a recovery_score.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from schemas import AdaptiveTurnResult, AnswerQualityAssessment, PushbackDecision, RecoveryEvaluation
from services.decision_engine import build_pushback_instruction, decide_pushback
from services.gemini import evaluate_recovery

logger = logging.getLogger(__name__)


@dataclass
class PushbackState:
    active: bool = False
    original_answer: str = ""
    challenge_text: str = ""
    topic: str = ""
    scores: list[int] = field(default_factory=list)

    @property
    def cumulative_score(self) -> int | None:
        if not self.scores:
            return None
        return round(sum(self.scores) / len(self.scores))


class RecoveryEngine:
    """In-memory recovery state keyed by session_id (mirrors EventStore lifetime)."""

    def __init__(self) -> None:
        self._sessions: dict[str, PushbackState] = {}

    def _state(self, session_id: str) -> PushbackState:
        if session_id not in self._sessions:
            self._sessions[session_id] = PushbackState()
        return self._sessions[session_id]

    def get_cumulative_score(self, session_id: str) -> int | None:
        return self._state(session_id).cumulative_score

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    async def process_turn(
        self,
        session_id: str,
        history: list[dict[str, str]],
        answer: str,
        interview_plan: list[dict[str, Any]] | None = None,
    ) -> AdaptiveTurnResult:
        """
        Main entry for each user chat turn.

        - If pushback is active → evaluate recovery from the follow-up answer.
        - Else → assess quality and maybe start a new pushback.
        """
        state = self._state(session_id)

        if state.active:
            return await self._evaluate_recovery_turn(session_id, state, answer)

        quality, decision = await decide_pushback(history, answer, interview_plan)
        return self._maybe_start_pushback(state, answer, quality, decision)

    async def _evaluate_recovery_turn(
        self,
        session_id: str,
        state: PushbackState,
        answer: str,
    ) -> AdaptiveTurnResult:
        try:
            raw = await evaluate_recovery(
                original_answer=state.original_answer,
                pushback_challenge=state.challenge_text,
                recovery_answer=answer,
                topic=state.topic,
            )
            recovery = RecoveryEvaluation.model_validate(raw)
        except Exception as exc:
            logger.error("Recovery evaluation failed for %s: %s", session_id, exc)
            recovery = RecoveryEvaluation(
                recognized_mistake=False,
                corrected_answer=False,
                recovery_score=0,
                rationale="Recovery evaluation unavailable.",
            )

        state.scores.append(recovery.recovery_score)
        recovered = recovery.recognized_mistake and recovery.corrected_answer
        # Clear pushback after one recovery attempt so the interview can advance
        challenge = state.challenge_text
        topic = state.topic
        state.active = False
        state.original_answer = ""
        state.challenge_text = ""
        state.topic = ""

        cumulative = state.cumulative_score or 0
        instruction = None
        if not recovered:
            # Soft nudge once more is optional; we clear active so Alex can decide.
            instruction = (
                "The candidate did not fully recover from the previous challenge. "
                "Acknowledge briefly, clarify the correct point in one sentence, "
                "then continue the interview. Do not open a new pushback on this turn."
            )

        return AdaptiveTurnResult(
            pushback_instruction=instruction,
            pushback_active=False,
            recovery_score_delta=recovery.recovery_score,
            cumulative_recovery_score=cumulative,
            user_metadata={
                "recovery_attempt": True,
                "recognized_mistake": recovery.recognized_mistake,
                "corrected_answer": recovery.corrected_answer,
                "recovery_score": recovery.recovery_score,
                "recovery_rationale": recovery.rationale,
                "topic": topic,
                "prior_challenge": challenge,
            },
            assistant_metadata={
                "recovery_evaluated": True,
                "recovered": recovered,
                "recovery_score": recovery.recovery_score,
                "cumulative_recovery_score": cumulative,
            },
        )

    def _maybe_start_pushback(
        self,
        state: PushbackState,
        answer: str,
        quality: AnswerQualityAssessment,
        decision: PushbackDecision,
    ) -> AdaptiveTurnResult:
        cumulative = state.cumulative_score or 0
        user_meta: dict[str, Any] = {
            "answer_quality": quality.quality,
            "is_technical": quality.is_technical,
            "topic": quality.topic,
            "quality_rationale": quality.rationale,
        }

        if not decision.should_pushback:
            return AdaptiveTurnResult(
                pushback_instruction=None,
                pushback_active=False,
                recovery_score_delta=0,
                cumulative_recovery_score=cumulative,
                user_metadata=user_meta,
                assistant_metadata={"pushback": False, "cumulative_recovery_score": cumulative},
            )

        state.active = True
        state.original_answer = answer
        state.challenge_text = decision.challenge_text
        state.topic = decision.target_topic or quality.topic

        instruction = build_pushback_instruction(state.challenge_text, state.topic)
        user_meta["pushback_triggered"] = True
        user_meta["challenge_text"] = state.challenge_text

        return AdaptiveTurnResult(
            pushback_instruction=instruction,
            pushback_active=True,
            recovery_score_delta=0,
            cumulative_recovery_score=cumulative,
            user_metadata=user_meta,
            assistant_metadata={
                "pushback": True,
                "challenge_text": state.challenge_text,
                "topic": state.topic,
                "cumulative_recovery_score": cumulative,
            },
        )


# Singleton — same lifetime pattern as event_store
recovery_engine = RecoveryEngine()
