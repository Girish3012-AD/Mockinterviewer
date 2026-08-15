"""
gemini.py — Async Gemini client (chat + structured JSON output)

Ported AI prompts from the original server.ts.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import google.generativeai as genai
from google.generativeai import types as gtypes

from config import settings

logger = logging.getLogger(__name__)

# Configure once at import time
genai.configure(api_key=settings.gemini_api_key)

MODEL = "gemini-2.5-flash"

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
) -> str:
    """Send a chat message to Alex. Returns the assistant's text reply."""
    system = ALEX_SYSTEM
    if interview_plan:
        plan_text = "\n".join(
            f"{i+1}. [{q['type']}] {q['question']} (focus: {q['focus_area']})"
            for i, q in enumerate(interview_plan)
        )
        system += f"\n\nINTERVIEW PLAN (follow this order):\n{plan_text}"

    model = genai.GenerativeModel(model_name=MODEL, system_instruction=system)

    # Convert history list to Gemini conversation history
    gemini_history = [
        {"role": turn["role"], "parts": [turn["content"]]}
        for turn in history
    ]
    chat = model.start_chat(history=gemini_history)
    response = await chat.send_message_async(message)
    return response.text


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
    response = await model.generate_content_async(prompt)
    data = json.loads(response.text)
    return data["interview_plan"]


async def extract_claims(resume: str) -> list[dict[str, Any]]:
    """Extract atomic, testable claims from a resume. Returns list of claim dicts."""
    system = """Extract atomic, testable claims from the resume. Each claim must be:
- A single, verifiable statement of skill, achievement, or experience.
- Specific enough to be challenged in an interview.

Return ONLY valid JSON array:
[
  {
    "claim_text": "...",
    "category": "Technical Skills | Work Experience | Leadership | Project | Education",
    "skill_tags": ["tag1", "tag2"],
    "importance": 1-5
  }
]"""

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    response = await model.generate_content_async(resume)
    return json.loads(response.text)


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
    response = await model.generate_content_async(prompt)
    return json.loads(response.text)


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
    response = await model.generate_content_async(prompt)
    return json.loads(response.text)


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
    data = json.loads(response.text)
    data["session_id"] = session_id
    return data
