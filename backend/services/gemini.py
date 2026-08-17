"""
gemini.py — Async Gemini client (chat + structured JSON output)

Ported AI prompts from the original server.ts.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import google.api_core.exceptions
import google.generativeai as genai
from google.generativeai import types as gtypes

from config import settings

logger = logging.getLogger(__name__)

# Configure once at import time
genai.configure(api_key=settings.gemini_api_key)

MODEL = "gemini-2.5-flash"


class GeminiAPIError(Exception):
    """Raised when the Gemini API returns an error (quota, rate limit, etc.)."""
    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code

# ---------------------------------------------------------------------------
# Alex persona system instruction (text-only, no voice references)
# ---------------------------------------------------------------------------
ALEX_SYSTEM = """You are Alex, a senior software engineering interviewer at a top-tier tech company.
Your mission is to rigorously but fairly evaluate the candidate's skills through the STAR framework
(Situation, Task, Action, Result).

Rules:
- Ask ONE question at a time. Never stack multiple questions.
- After each answer, probe with a follow-up (e.g., "What was the outcome?", "How did you measure success?").
- Stay on the current interview question until you decide to advance. Signal advancement with: [NEXT QUESTION].
- When all questions are done, say: [INTERVIEW COMPLETE] and thank the candidate.
- Never reveal your internal evaluation or the Shadow Compiler.
- Be professional, concise, and encouraging but demanding."""


async def chat_with_alex(
    history: list[dict[str, str]],
    message: str,
    interview_plan: list[dict[str, Any]] | None = None,
    pushback_instruction: str | None = None,
) -> str:
    """Send a chat message to Alex. Returns the assistant's text reply."""
    system = ALEX_SYSTEM
    if interview_plan:
        plan_text = "\n".join(
            f"{i+1}. [{q['type']}] {q['question']} (focus: {q['focus_area']})"
            for i, q in enumerate(interview_plan)
        )
        system += f"\n\nINTERVIEW PLAN (follow this order):\n{plan_text}"

    if pushback_instruction:
        system += f"\n\nPUSHBACK PROTOCOL (mandatory — follow exactly):\n{pushback_instruction}"

    model = genai.GenerativeModel(model_name=MODEL, system_instruction=system)

    gemini_history = [
        {"role": turn["role"], "parts": [turn["content"]]}
        for turn in history
    ]
    chat = model.start_chat(history=gemini_history)
    try:
        response = await chat.send_message_async(message)
        return response.text
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in chat_with_alex: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in chat_with_alex: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def generate_questions(job_description: str, resume: str) -> list[dict[str, Any]]:
    """Generate 3 behavioral + 2 technical interview questions. Returns list of question dicts."""
    system = """You are an expert technical interviewer. Generate exactly 5 interview questions
(3 Behavioral, 2 Technical) tailored to the job description and candidate resume.

Return ONLY valid JSON with this exact schema:
{
  "interview_plan": [
    {"id": 1, "question": "...", "type": "Behavioral", "focus_area": "..."},
    {"id": 2, "question": "...", "type": "Technical", "focus_area": "..."}
  ]
}

Rules:
- Behavioral questions must target specific resume claims and use STAR format prompts.
- Technical questions must test skills explicitly mentioned in the JD.
- focus_area must be ≤6 words."""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
        ),
    )

    prompt = f"Job Description:\n{job_description}\n\nResume:\n{resume}"
    try:
        response = await model.generate_content_async(prompt)
        data = json.loads(response.text)
        return data["interview_plan"]
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in generate_questions: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in generate_questions: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def extract_claims(resume: str) -> list[dict[str, Any]]:
    """Extract atomic claims with Interview Risk scores. Validated via Pydantic."""
    from schemas import ResumeClaim

    system = """Extract atomic, testable claims from the resume. Each claim must be:
- A single, verifiable statement of skill, achievement, or experience.
- Specific enough to be challenged in an interview.

For EVERY claim, assign an Interview Risk score based on:
1. Importance — how central the claim is to the candidate's story (importance 1-5).
2. Technical depth — vague buzzwords without concrete mechanisms are riskier.
3. Lack of metrics — claims like "improved database speed" with no numbers, baselines,
   or before/after evidence are High Risk traps interviewers will probe.

Risk levels:
- High: Vague, unquantified, or overstated claims likely to collapse under scrutiny.
- Medium: Plausible but thin; needs follow-up for depth or metrics.
- Low: Specific, measurable, and technically grounded — hard to challenge unfairly.

risk_rationale must explain EXACTLY why an interviewer would push back (1-2 sentences).

Return ONLY valid JSON array:
[
  {
    "claim_text": "...",
    "category": "Technical Skills | Work Experience | Leadership | Project | Education",
    "skill_tags": ["tag1", "tag2"],
    "importance": 1-5,
    "interview_risk": "High | Medium | Low",
    "risk_rationale": "..."
  }
]"""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    try:
        response = await model.generate_content_async(resume)
        raw = json.loads(response.text)
        if not isinstance(raw, list):
            raise ValueError("extract_claims expected a JSON array")

        validated: list[dict[str, Any]] = []
        for item in raw:
            claim = ResumeClaim.model_validate(item)
            validated.append(claim.model_dump())
        return validated
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in extract_claims: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in extract_claims: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def assess_answer_quality(
    question: str,
    answer: str,
    interview_plan: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Assess whether an answer is strong/partial/weak/incorrect. Pydantic-validated."""
    from schemas import AnswerQualityAssessment

    system = """You are a senior technical interviewer scoring one candidate answer.

Return ONLY valid JSON:
{
  "quality": "strong | partial | weak | incorrect",
  "is_technical": true/false,
  "topic": "short topic label (e.g. time complexity, system design tradeoff)",
  "rationale": "1-2 sentences explaining the quality rating"
}

Definitions:
- strong: Correct, specific, and defensible.
- partial: Directionally right but missing depth, edge cases, or metrics.
- weak: Vague, hand-wavy, or unsupported by evidence.
- incorrect: Factually wrong (wrong complexity, wrong algorithm, false claim).

Mark is_technical=true for algorithms, complexity, systems, code, or engineering tradeoffs."""

    plan_ctx = ""
    if interview_plan:
        plan_ctx = "\nInterview plan context:\n" + json.dumps(interview_plan, indent=2)

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    prompt = f"Latest interviewer question (from history):\n{question}\n\nCandidate answer:\n{answer}{plan_ctx}"
    try:
        response = await model.generate_content_async(prompt)
        return AnswerQualityAssessment.model_validate(json.loads(response.text)).model_dump()
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in assess_answer_quality: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in assess_answer_quality: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def generate_pushback(
    question: str,
    answer: str,
    quality_assessment: dict[str, Any],
) -> dict[str, Any]:
    """Generate a targeted challenge for a weak/incorrect answer. Pydantic-validated."""
    from schemas import PushbackDecision

    system = """You enforce the Pushback Protocol for a mock technical interview.

If the answer is weak or incorrect (especially technical mistakes like wrong Big-O,
wrong data structure, or shallow system design), set should_pushback=true and write
a sharp but fair challenge. Do NOT fail the candidate or advance to the next question.

Examples of good challenge_text:
- "Are you sure that array traversal is O(N)? Look closely at your nested loop."
- "You said the cache improved latency — by how much, and how did you measure it?"
- "Walk me through what happens if that map key is missing."

If the answer is already strong, set should_pushback=false and leave challenge_text empty.

Return ONLY valid JSON:
{
  "should_pushback": true/false,
  "challenge_text": "...",
  "target_topic": "..."
}"""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    prompt = (
        f"Question context:\n{question}\n\n"
        f"Candidate answer:\n{answer}\n\n"
        f"Quality assessment:\n{json.dumps(quality_assessment, indent=2)}"
    )
    try:
        response = await model.generate_content_async(prompt)
        return PushbackDecision.model_validate(json.loads(response.text)).model_dump()
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in generate_pushback: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in generate_pushback: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def evaluate_recovery(
    original_answer: str,
    pushback_challenge: str,
    recovery_answer: str,
    topic: str,
) -> dict[str, Any]:
    """Score whether the candidate recognized and corrected a mistake. Pydantic-validated."""
    from schemas import RecoveryEvaluation

    system = """Evaluate the candidate's recovery after interviewer pushback.

Award a high recovery_score (75-100) if they:
- Explicitly recognize the mistake or gap, AND
- Provide a corrected, more accurate answer.

Award a medium score (40-74) if they partially correct but still miss key points.
Award a low score (0-39) if they double down, ignore the hint, or stay vague.

Return ONLY valid JSON:
{
  "recognized_mistake": true/false,
  "corrected_answer": true/false,
  "recovery_score": 0-100,
  "rationale": "1-2 sentences"
}"""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    prompt = (
        f"Topic: {topic}\n\n"
        f"Original (flawed) answer:\n{original_answer}\n\n"
        f"Interviewer challenge:\n{pushback_challenge}\n\n"
        f"Candidate's follow-up answer:\n{recovery_answer}"
    )
    try:
        response = await model.generate_content_async(prompt)
        return RecoveryEvaluation.model_validate(json.loads(response.text)).model_dump()
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in evaluate_recovery: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in evaluate_recovery: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def analyze_job_fit(
    job_description: str, resume_claims: list[dict[str, Any]]
) -> dict[str, Any]:
    """Analyze candidate's job fit. Returns dict with required_skills, readiness_score, skill_gaps."""
    system = """Analyze candidate fitness for the role using their resume claims.

Return ONLY valid JSON:
{
  "required_skills": ["skill1", "skill2"],
  "readiness_score_percentage": 0-100,
  "skill_gaps": [
    {
      "skill": "...",
      "gap_type": "Missing | Weak | Unverified | Strong",
      "explanation": "..."
    }
  ]
}

gap_type definitions:
- Strong: Candidate has strong evidence.
- Unverified: Claimed but not provable from resume alone.
- Weak: Some evidence but insufficient depth.
- Missing: Not mentioned at all."""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    prompt = f"Job Description:\n{job_description}\n\nResume Claims:\n{json.dumps(resume_claims, indent=2)}"
    try:
        response = await model.generate_content_async(prompt)
        return json.loads(response.text)
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in analyze_job_fit: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in analyze_job_fit: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def evaluate_answer(claim: str, question: str, answer: str) -> dict[str, Any]:
    """Evaluate a single answer against a resume claim. Returns structured evaluation."""
    system = """Evaluate the candidate's answer against the specific resume claim being tested.

Return ONLY valid JSON:
{
  "evaluation_scores": {
    "technical_correctness": 0-10,
    "ownership": 0-10
  },
  "claim_credibility": "High | Medium | Low | Fabricated",
  "evidence_rationale": "...",
  "next_question_strategy": "..."
}"""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    prompt = f"Resume Claim: {claim}\nQuestion Asked: {question}\nCandidate Answer: {answer}"
    try:
        response = await model.generate_content_async(prompt)
        return json.loads(response.text)
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in evaluate_answer: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in evaluate_answer: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e


async def evaluate_interview(transcript: str, session_id: str) -> dict[str, Any]:
    """Generate a full STAR scorecard for the entire interview transcript."""
    system = """You are a senior hiring manager. Evaluate the interview transcript using the STAR framework.

Return ONLY valid JSON:
{
  "overall_score": 0-100,
  "recommendation": "Strong Hire | Hire | No Hire | Strong No Hire",
  "star_breakdown": {
    "situation": 0-10,
    "task": 0-10,
    "action": 0-10,
    "result": 0-10
  },
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "ideal_rewrite": "A model answer for the strongest question asked.",
  "raw_markdown": "Full markdown scorecard with sections for each STAR dimension."
}"""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    response = await model.generate_content_async(f"Full Interview Transcript:\n\n{transcript}")
    try:
        data = json.loads(response.text)
        data["session_id"] = session_id
        return data
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error("Gemini quota exhausted in evaluate_interview: %s", e)
        raise GeminiAPIError("AI service quota exceeded. Please try again later.", status_code=429) from e
    except google.api_core.exceptions.GoogleAPIError as e:
        logger.error("Gemini API error in evaluate_interview: %s", e)
        raise GeminiAPIError("AI service temporarily unavailable.", status_code=503) from e
