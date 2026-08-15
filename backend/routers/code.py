"""
routers/code.py — Code submission: Docker sandbox + Shadow Compiler
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from event_store import event_store
from models import InterviewSession
from schemas import CodeSubmitRequest, CodeSubmitResponse
from services.sandbox import run_java
from services.shadow_compiler import evaluate_code

router = APIRouter(prefix="/api", tags=["code"])


@router.post("/code/submit", response_model=CodeSubmitResponse)
async def submit_code(
    body: CodeSubmitRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CodeSubmitResponse:
    """
    1. Run code in ephemeral Docker sandbox.
    2. Shadow Compiler evaluates the result.
    3. Both events stored in-memory EventStore (bulk-written on interview end).
    """
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == body.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Run in Docker sandbox
    exec_result = await run_java(body.source_code)

    # Store code submission event
    code_event = await event_store.append(
        session_id=body.session_id,
        role="user",
        content=body.source_code,
        event_type="code_submit",
        metadata={"question": body.question},
    )

    # Store execution result event
    await event_store.append(
        session_id=body.session_id,
        role="assistant",
        content=f"stdout: {exec_result.stdout}\nstderr: {exec_result.stderr}",
        event_type="code_result",
        metadata={
            "exit_code": exec_result.exit_code,
            "stdout": exec_result.stdout,
            "stderr": exec_result.stderr,
        },
    )

    # Shadow Compiler (hidden evaluation)
    shadow_report = await evaluate_code(
        source_code=body.source_code,
        question=body.question,
        stdout=exec_result.stdout,
        stderr=exec_result.stderr,
        exit_code=exec_result.exit_code,
    )

    return CodeSubmitResponse(
        stdout=exec_result.stdout,
        stderr=exec_result.stderr,
        exit_code=exec_result.exit_code,
        shadow_report=shadow_report,
    )
