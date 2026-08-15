"""
shadow_compiler.py — Hidden LLM code evaluator (never speaks to user).
Outputs structured JSON only.
"""
from __future__ import annotations

import json
import logging

import google.generativeai as genai

from config import settings
from schemas import ShadowCompilerReport

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.gemini_api_key)

_SHADOW_SYSTEM = """You are the Shadow Compiler — a silent, hidden code evaluation agent.
You receive Java source code, a coding question, and execution output (stdout/stderr).
You NEVER speak to the user. You output ONLY structured JSON.

Evaluate the code and return:
{
  "correct": true|false,
  "correctness_score": 0-100,
  "time_complexity": "O(n)" or null,
  "space_complexity": "O(n)" or null,
  "issues": ["issue1", "issue2"] or null,
  "feedback": "Concise technical feedback for internal use only." or null
}

Be strict. Score 100 only if the solution is optimal AND correct."""


async def evaluate_code(
    source_code: str,
    question: str,
    stdout: str,
    stderr: str,
    exit_code: int,
) -> ShadowCompilerReport:
    """Run Shadow Compiler on submitted Java code. Returns ShadowCompilerReport."""
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=_SHADOW_SYSTEM,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )

    prompt = (
        f"Question: {question}\n\n"
        f"Source Code:\n```java\n{source_code}\n```\n\n"
        f"Execution stdout:\n{stdout or '(empty)'}\n\n"
        f"Execution stderr:\n{stderr or '(empty)'}\n\n"
        f"Exit code: {exit_code}"
    )

    try:
        response = await model.generate_content_async(prompt)
        data = json.loads(response.text)
        return ShadowCompilerReport(**data)
    except Exception as exc:
        logger.error("Shadow Compiler error: %s", exc)
        return ShadowCompilerReport(
            correct=False,
            correctness_score=0,
            issues=["Shadow Compiler evaluation failed."],
            feedback=str(exc),
        )
