"""
routers/analysis.py — Resume claim extraction, job fit analysis, answer evaluation
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import InterviewSession, JobFitAnalysis, ResumeClaim
from schemas import (
    AnalyzeJobFitRequest,
    EvaluateAnswerRequest,
    EvaluateAnswerResponse,
    ExtractClaimsRequest,
    ExtractClaimsResponse,
    JobFitResponse,
)
from services.gemini import analyze_job_fit, evaluate_answer, extract_claims
from services.gemini import GeminiAPIError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["analysis"])


@router.post("/extract-claims", response_model=ExtractClaimsResponse)
async def api_extract_claims(
    body: ExtractClaimsRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExtractClaimsResponse:
    """Extract atomic claims from resume text and persist to MySQL."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == body.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        claims_raw = await extract_claims(body.resume)
    except GeminiAPIError as e:
        logger.warning("Falling back to demo claims due to AI service error: %s", e)
        claims_raw = [
            {
                "claim_text": "Experienced software developer with strong technical skills",
                "category": "Work Experience",
                "skill_tags": ["Software Development", "Problem Solving"],
                "importance": 5,
                "interview_risk": "Medium",
                "risk_rationale": "Claim is broad but plausible for a senior role.",
            },
            {
                "claim_text": "Proficient in modern web technologies and frameworks",
                "category": "Technical Skills",
                "skill_tags": ["Web Development", "Frontend", "Backend"],
                "importance": 4,
                "interview_risk": "Medium",
                "risk_rationale": "Common claim that requires specific examples to validate.",
            },
            {
                "claim_text": "Delivered projects on time with high quality standards",
                "category": "Work Experience",
                "skill_tags": ["Project Management", "Quality Assurance"],
                "importance": 4,
                "interview_risk": "High",
                "risk_rationale": "Vague claim without metrics or specific project details.",
            },
        ]

    # Persist claims (including Interview Risk from Vulnerability Map)
    for c in claims_raw:
        db.add(
            ResumeClaim(
                session_id=body.session_id,
                claim_text=c["claim_text"],
                category=c.get("category"),
                skill_tags=c.get("skill_tags"),
                importance=c.get("importance"),
                interview_risk=c.get("interview_risk"),
                risk_rationale=c.get("risk_rationale"),
            )
        )
    await db.commit()

    from schemas import ResumeClaim as RCSchema

    return ExtractClaimsResponse(
        session_id=body.session_id,
        claims=[
            RCSchema(
                claim_text=c["claim_text"],
                category=c.get("category", ""),
                skill_tags=c.get("skill_tags", []),
                importance=c.get("importance", 3),
                interview_risk=c.get("interview_risk", "Medium"),
                risk_rationale=c.get("risk_rationale", ""),
            )
            for c in claims_raw
        ],
    )


@router.post("/analyze-job-fit", response_model=JobFitResponse)
async def api_analyze_job_fit(
    body: AnalyzeJobFitRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobFitResponse:
    """Analyze job fit against resume claims and persist to MySQL."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == body.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        claims_dicts = [c.model_dump() for c in body.resume_claims]
        fit_data = await analyze_job_fit(body.job_description, claims_dicts)
    except GeminiAPIError as e:
        logger.warning("Falling back to demo job fit due to AI service error: %s", e)
        fit_data = {
            "required_skills": ["JavaScript", "React", "Node.js", "SQL", "System Design"],
            "readiness_score_percentage": 72,
            "skill_gaps": [
                {
                    "skill": "System Design",
                    "gap_type": "Weak",
                    "explanation": "Resume mentions projects but lacks evidence of large-scale system design experience.",
                },
                {
                    "skill": "SQL Optimization",
                    "gap_type": "Unverified",
                    "explanation": "Claimed database work but no specific optimization examples provided.",
                },
            ],
        }

    # Upsert job fit
    existing = await db.execute(
        select(JobFitAnalysis).where(JobFitAnalysis.session_id == body.session_id)
    )
    jfa = existing.scalar_one_or_none()
    if jfa:
        jfa.required_skills = fit_data.get("required_skills")
        jfa.readiness_score = fit_data.get("readiness_score_percentage")
        jfa.skill_gaps = fit_data.get("skill_gaps")
    else:
        db.add(
            JobFitAnalysis(
                session_id=body.session_id,
                required_skills=fit_data.get("required_skills"),
                readiness_score=fit_data.get("readiness_score_percentage"),
                skill_gaps=fit_data.get("skill_gaps"),
            )
        )

    # Update session readiness score
    session.readiness_score = fit_data.get("readiness_score_percentage")
    await db.commit()

    from schemas import SkillGap

    return JobFitResponse(
        session_id=body.session_id,
        required_skills=fit_data.get("required_skills", []),
        readiness_score_percentage=fit_data.get("readiness_score_percentage", 0),
        skill_gaps=[SkillGap(**g) for g in fit_data.get("skill_gaps", [])],
    )


@router.post("/evaluate-answer", response_model=EvaluateAnswerResponse)
async def api_evaluate_answer(body: EvaluateAnswerRequest) -> EvaluateAnswerResponse:
    """Evaluate a single answer against a resume claim (no DB write)."""
    try:
        data = await evaluate_answer(body.claim, body.question, body.answer)
    except GeminiAPIError as e:
        logger.warning("AI service error in evaluate_answer: %s", e)
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    from schemas import EvaluationScores

    return EvaluateAnswerResponse(
        evaluation_scores=EvaluationScores(**data["evaluation_scores"]),
        claim_credibility=data["claim_credibility"],
        evidence_rationale=data["evidence_rationale"],
        next_question_strategy=data["next_question_strategy"],
    )
