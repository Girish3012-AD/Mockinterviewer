"""
schemas.py — Pydantic request/response models
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Setup — Session
# ---------------------------------------------------------------------------
class CreateSessionRequest(BaseModel):
    job_description: str = Field(..., min_length=10)
    resume: str = Field(..., min_length=10)


class SessionResponse(BaseModel):
    session_id: str
    status: str


# ---------------------------------------------------------------------------
# Setup — Questions
# ---------------------------------------------------------------------------
class GenerateQuestionsRequest(BaseModel):
    session_id: str
    job_description: str
    resume: str


class InterviewQuestion(BaseModel):
    id: int
    question: str
    type: Literal["Behavioral", "Technical"]
    focus_area: str


class InterviewPlanResponse(BaseModel):
    session_id: str
    interview_plan: list[InterviewQuestion]


# ---------------------------------------------------------------------------
# Analysis — Resume Claims
# ---------------------------------------------------------------------------
class ExtractClaimsRequest(BaseModel):
    session_id: str
    resume: str


class ResumeClaim(BaseModel):
    claim_text: str
    category: str
    skill_tags: list[str]
    importance: int = Field(..., ge=1, le=5)
    interview_risk: Literal["High", "Medium", "Low"] = "Medium"
    risk_rationale: str = ""


class ExtractClaimsResponse(BaseModel):
    session_id: str
    claims: list[ResumeClaim]


# ---------------------------------------------------------------------------
# Analysis — Job Fit
# ---------------------------------------------------------------------------
class SkillGap(BaseModel):
    skill: str
    gap_type: Literal["Missing", "Weak", "Unverified", "Strong"]
    explanation: str


class AnalyzeJobFitRequest(BaseModel):
    session_id: str
    job_description: str
    resume_claims: list[ResumeClaim]


class JobFitResponse(BaseModel):
    session_id: str
    required_skills: list[str]
    readiness_score_percentage: int
    skill_gaps: list[SkillGap]


# ---------------------------------------------------------------------------
# Analysis — Evaluate Answer
# ---------------------------------------------------------------------------
class EvaluateAnswerRequest(BaseModel):
    claim: str
    question: str
    answer: str


class EvaluationScores(BaseModel):
    technical_correctness: int = Field(..., ge=0, le=10)
    ownership: int = Field(..., ge=0, le=10)


class EvaluateAnswerResponse(BaseModel):
    evaluation_scores: EvaluationScores
    claim_credibility: Literal["High", "Medium", "Low", "Fabricated"]
    evidence_rationale: str
    next_question_strategy: str


# ---------------------------------------------------------------------------
# Adaptive Decision Engine — Pushback & Recovery
# ---------------------------------------------------------------------------
class AnswerQualityAssessment(BaseModel):
    quality: Literal["strong", "partial", "weak", "incorrect"]
    is_technical: bool
    topic: str
    rationale: str


class PushbackDecision(BaseModel):
    should_pushback: bool
    challenge_text: str = ""
    target_topic: str = ""


class RecoveryEvaluation(BaseModel):
    recognized_mistake: bool
    corrected_answer: bool
    recovery_score: int = Field(..., ge=0, le=100)
    rationale: str


class AdaptiveTurnResult(BaseModel):
    pushback_instruction: str | None = None
    pushback_active: bool = False
    recovery_score_delta: int = 0
    cumulative_recovery_score: int = 0
    user_metadata: dict[str, Any] = Field(default_factory=dict)
    assistant_metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Shadow Compiler
# ---------------------------------------------------------------------------
class ShadowCompilerReport(BaseModel):
    correct: bool
    correctness_score: int = Field(..., ge=0, le=100)
    time_complexity: str | None = None
    space_complexity: str | None = None
    issues: list[str] | None = None
    feedback: str | None = None


# ---------------------------------------------------------------------------
# Code Submission
# ---------------------------------------------------------------------------
class CodeSubmitRequest(BaseModel):
    session_id: str
    source_code: str
    question: str


class CodeSubmitResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    shadow_report: ShadowCompilerReport | None = None


# ---------------------------------------------------------------------------
# WebSocket message envelope
# ---------------------------------------------------------------------------
class WsMessageIn(BaseModel):
    type: Literal["chat", "code_submit", "end_interview"]
    content: str = ""
    metadata: dict[str, Any] | None = None


class WsMessageOut(BaseModel):
    type: str
    content: str = ""
    metadata: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Past Sessions
# ---------------------------------------------------------------------------
class SessionListItem(BaseModel):
    id: str
    status: str
    created_at: str
    readiness_score: int | None
    recovery_score: int | None = None


class SessionDetail(BaseModel):
    id: str
    status: str
    job_desc: str
    resume: str
    created_at: str
    updated_at: str
    readiness_score: int | None
    recovery_score: int | None = None
    questions: list[InterviewQuestion]
    evaluation: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Scorecard / Evaluation
# ---------------------------------------------------------------------------
class StarBreakdown(BaseModel):
    situation: int = Field(..., ge=0, le=10)
    task: int = Field(..., ge=0, le=10)
    action: int = Field(..., ge=0, le=10)
    result: int = Field(..., ge=0, le=10)


class EvaluationResponse(BaseModel):
    session_id: str
    overall_score: int
    recommendation: str
    star_breakdown: StarBreakdown
    strengths: list[str]
    weaknesses: list[str]
    ideal_rewrite: str
    raw_markdown: str
