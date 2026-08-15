"""
routers/sessions.py — Past sessions listing, detail, and deletion + evaluation trigger
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from event_consumer import drain_and_persist
from models import ChatEvent, Evaluation, InterviewQuestion, InterviewSession
from schemas import (
    EvaluationResponse,
    InterviewQuestion as IQSchema,
    SessionDetail,
    SessionListItem,
    StarBreakdown,
)
from services.gemini import evaluate_interview

router = APIRouter(prefix="/api", tags=["sessions"])


@router.get("/sessions", response_model=list[SessionListItem])
async def list_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SessionListItem]:
    result = await db.execute(
        select(InterviewSession).order_by(InterviewSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        SessionListItem(
            id=s.id,
            status=s.status,
            created_at=s.created_at.isoformat(),
            readiness_score=s.readiness_score,
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionDetail:
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    q_result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.session_id == session_id)
        .order_by(InterviewQuestion.sequence)
    )
    questions = q_result.scalars().all()

    eval_result = await db.execute(
        select(Evaluation).where(Evaluation.session_id == session_id)
    )
    evaluation = eval_result.scalar_one_or_none()
    eval_dict = None
    if evaluation:
        eval_dict = {
            "overall_score": evaluation.overall_score,
            "recommendation": evaluation.recommendation,
            "star_breakdown": evaluation.star_breakdown,
            "strengths": evaluation.strengths,
            "weaknesses": evaluation.weaknesses,
            "ideal_rewrite": evaluation.ideal_rewrite,
            "raw_markdown": evaluation.raw_markdown,
        }

    return SessionDetail(
        id=session.id,
        status=session.status,
        job_desc=session.job_desc,
        resume=session.resume,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat(),
        readiness_score=session.readiness_score,
        questions=[
            IQSchema(id=q.sequence, question=q.question, type=q.type, focus_area=q.focus_area)
            for q in questions
        ],
        evaluation=eval_dict,
    )


@router.post("/sessions/{session_id}/end", response_model=EvaluationResponse)
async def end_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EvaluationResponse:
    """
    End interview:
    1. Drain EventStore → bulk write chat_events to MySQL.
    2. Generate STAR evaluation via Gemini.
    3. Write evaluation to MySQL.
    4. Mark session completed.
    """
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Drain events → MySQL
    events = await drain_and_persist(session_id, db)

    # Build transcript for evaluation
    transcript_lines = [
        f"{e.role.upper()}: {e.content}"
        for e in events
        if e.event_type == "chat"
    ]
    transcript = "\n".join(transcript_lines)

    # Generate STAR evaluation
    eval_data = await evaluate_interview(transcript, session_id)

    # Persist evaluation
    evaluation = Evaluation(
        session_id=session_id,
        overall_score=eval_data.get("overall_score"),
        recommendation=eval_data.get("recommendation"),
        star_breakdown=eval_data.get("star_breakdown"),
        strengths=eval_data.get("strengths"),
        weaknesses=eval_data.get("weaknesses"),
        ideal_rewrite=eval_data.get("ideal_rewrite"),
        raw_markdown=eval_data.get("raw_markdown"),
    )
    db.add(evaluation)

    session.status = "completed"
    await db.commit()

    sb = eval_data.get("star_breakdown", {})
    return EvaluationResponse(
        session_id=session_id,
        overall_score=eval_data.get("overall_score", 0),
        recommendation=eval_data.get("recommendation", "No Hire"),
        star_breakdown=StarBreakdown(
            situation=sb.get("situation", 0),
            task=sb.get("task", 0),
            action=sb.get("action", 0),
            result=sb.get("result", 0),
        ),
        strengths=eval_data.get("strengths", []),
        weaknesses=eval_data.get("weaknesses", []),
        ideal_rewrite=eval_data.get("ideal_rewrite", ""),
        raw_markdown=eval_data.get("raw_markdown", ""),
    )


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"deleted": session_id}
