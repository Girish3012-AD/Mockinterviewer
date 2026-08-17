"""
routers/interview.py — Session creation + question generation endpoints
"""
import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from event_store import event_store
from models import InterviewQuestion, InterviewSession
from schemas import (
    CreateSessionRequest,
    GenerateQuestionsRequest,
    InterviewPlanResponse,
    SessionResponse,
)
from schemas import InterviewQuestion as IQSchema
from services.gemini import generate_questions
from services.gemini import GeminiAPIError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["interview"])


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    body: CreateSessionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionResponse:
    """Create a new interview session and register it in the in-memory EventStore."""
    session_id = str(uuid.uuid4())
    session = InterviewSession(
        id=session_id,
        status="setup",
        job_desc=body.job_description,
        resume=body.resume,
    )
    db.add(session)
    await db.commit()
    await event_store.create_session(session_id)
    return SessionResponse(session_id=session_id, status="setup")


@router.post("/generate-questions", response_model=InterviewPlanResponse)
async def api_generate_questions(
    body: GenerateQuestionsRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewPlanResponse:
    """Generate 5 interview questions (3 Behavioral + 2 Technical) using Gemini."""
    # Validate session exists
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == body.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        questions_raw = await generate_questions(body.job_description, body.resume)
    except GeminiAPIError as e:
        logger.warning("Falling back to demo questions due to AI service error: %s", e)
        questions_raw = [
            {"id": 1, "question": "Tell me about a time you had to solve a difficult technical problem. What was your approach?", "type": "Behavioral", "focus_area": "Problem Solving"},
            {"id": 2, "question": "Describe a situation where you had to collaborate with a difficult team member. How did you handle it?", "type": "Behavioral", "focus_area": "Team Collaboration"},
            {"id": 3, "question": "Give an example of a project where you had to learn a new technology quickly. What was the outcome?", "type": "Behavioral", "focus_area": "Learning Agility"},
            {"id": 4, "question": "Explain the difference between SQL and NoSQL databases. When would you use each?", "type": "Technical", "focus_area": "Database Design"},
            {"id": 5, "question": "How would you design a URL shortening service like bit.ly? Walk me through the architecture.", "type": "Technical", "focus_area": "System Design"},
        ]

    # Persist to MySQL
    db_questions = []
    for i, q in enumerate(questions_raw):
        iq = InterviewQuestion(
            session_id=body.session_id,
            sequence=i + 1,
            question=q["question"],
            type=q["type"],
            focus_area=q["focus_area"],
        )
        db.add(iq)
        db_questions.append(iq)

    # Mark session as ready to go active
    session.status = "setup"
    await db.commit()

    plan = [
        IQSchema(id=i + 1, question=q["question"], type=q["type"], focus_area=q["focus_area"])
        for i, q in enumerate(questions_raw)
    ]
    return InterviewPlanResponse(session_id=body.session_id, interview_plan=plan)


@router.post("/sessions/{session_id}/start")
async def start_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Mark session as active (called just before WebSocket connect)."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "active"
    await db.commit()
    # Ensure EventStore has this session
    if not await event_store.session_exists(session_id):
        await event_store.create_session(session_id)
    return {"status": "active"}
