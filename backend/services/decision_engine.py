"""
decision_engine.py — Adaptive Decision Engine (Pushback Protocol)

Assesses each candidate answer. On weak/incorrect technical answers, triggers
a targeted challenge instead of advancing or silently failing the candidate.
"""
from __future__ import annotations

import logging
from typing import Any

from schemas import AnswerQualityAssessment, PushbackDecision
from services.gemini import assess_answer_quality, generate_pushback

logger = logging.getLogger(__name__)


def _latest_assistant_question(history: list[dict[str, str]]) -> str:
    """Pull the most recent interviewer utterance as question context."""
    for turn in reversed(history):
        role = turn.get("role", "")
        if role in ("model", "assistant"):
            return turn.get("content", "")
    return ""


async def decide_pushback(
    history: list[dict[str, str]],
    answer: str,
    interview_plan: list[dict[str, Any]] | None = None,
) -> tuple[AnswerQualityAssessment, PushbackDecision]:
    """
    Run quality assessment + optional pushback generation.

    Returns validated Pydantic models. On Gemini failure, fail open
    (no pushback) so the live interview is never blocked.
    """
    question = _latest_assistant_question(history)

    try:
        quality_raw = await assess_answer_quality(question, answer, interview_plan)
        quality = AnswerQualityAssessment.model_validate(quality_raw)
    except Exception as exc:
        logger.error("Answer quality assessment failed: %s", exc)
        quality = AnswerQualityAssessment(
            quality="partial",
            is_technical=False,
            topic="unknown",
            rationale="Assessment unavailable; continuing interview.",
        )
        return quality, PushbackDecision(should_pushback=False)

    should_consider = quality.quality in ("weak", "incorrect") and quality.is_technical
    if not should_consider:
        return quality, PushbackDecision(should_pushback=False, target_topic=quality.topic)

    try:
        decision_raw = await generate_pushback(question, answer, quality.model_dump())
        decision = PushbackDecision.model_validate(decision_raw)
    except Exception as exc:
        logger.error("Pushback generation failed: %s", exc)
        return quality, PushbackDecision(should_pushback=False, target_topic=quality.topic)

    if decision.should_pushback and not decision.challenge_text.strip():
        decision.should_pushback = False

    if not decision.target_topic:
        decision.target_topic = quality.topic

    return quality, decision


def build_pushback_instruction(challenge_text: str, topic: str) -> str:
    """Instruction injected into Alex's system prompt during an active pushback."""
    return (
        "The candidate's last answer was weak or incorrect on a technical point. "
        "Do NOT advance with [NEXT QUESTION] and do NOT end the interview. "
        "Challenge them with this targeted follow-up (paraphrase naturally in your voice, "
        "but keep the technical point intact):\n"
        f'"{challenge_text}"\n'
        f"Topic under scrutiny: {topic}. "
        "Give them a chance to recover. Stay on this point until they correct themselves "
        "or clearly cannot."
    )
