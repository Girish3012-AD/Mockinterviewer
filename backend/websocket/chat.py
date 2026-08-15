"""
websocket/chat.py — WebSocket handler: /ws/interview/{session_id}

Protocol:
  Client → Server: JSON { "type": "chat"|"end_interview", "content": "..." }
  Server → Client: JSON { "type": "chat"|"error"|"interview_complete", "content": "...", "metadata": {} }

Zero MySQL writes during the interview. All events buffered in EventStore.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from event_store import event_store
from models import InterviewQuestion, InterviewSession
from services.gemini import chat_with_alex

logger = logging.getLogger(__name__)


async def interview_ws_handler(
    websocket: WebSocket,
    session_id: str,
    db: AsyncSession,
) -> None:
    """Main WebSocket handler for a live interview session."""
    await websocket.accept()

    # Validate session
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        await websocket.send_json({"type": "error", "content": "Session not found."})
        await websocket.close(code=4004)
        return

    # Load interview plan
    q_result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.session_id == session_id)
        .order_by(InterviewQuestion.sequence)
    )
    questions = q_result.scalars().all()
    interview_plan: list[dict[str, Any]] = [
        {"id": q.sequence, "question": q.question, "type": q.type, "focus_area": q.focus_area}
        for q in questions
    ]

    # Ensure EventStore has this session
    if not await event_store.session_exists(session_id):
        await event_store.create_session(session_id)

    # Send interview plan to client
    await websocket.send_json({
        "type": "interview_plan",
        "content": "",
        "metadata": {"plan": interview_plan},
    })

    # Send opening message from Alex
    opening = (
        "Welcome to your mock interview! I'm Alex, your interviewer today. "
        "We have a structured set of questions to go through. Take your time with each answer. "
        "Let's begin — tell me about yourself and why you're interested in this role."
    )
    await event_store.append(session_id, "assistant", opening, "chat")
    await websocket.send_json({"type": "chat", "content": opening})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "content": "Invalid JSON."})
                continue

            msg_type = msg.get("type", "chat")
            content = msg.get("content", "").strip()

            if msg_type == "end_interview":
                await websocket.send_json({
                    "type": "interview_complete",
                    "content": "Interview ended. Generating your scorecard...",
                })
                break

            if not content:
                continue

            # Store user event
            await event_store.append(session_id, "user", content, "chat")

            # Build chat history from EventStore
            history_events = await event_store.get_history(session_id)
            # Exclude the last user event (we'll pass it as `message`)
            history = [
                {"role": e.role if e.role != "assistant" else "model", "content": e.content}
                for e in history_events[:-1]
                if e.event_type == "chat"
            ]

            # Call Alex
            try:
                alex_reply = await chat_with_alex(history, content, interview_plan)
            except Exception as exc:
                logger.error("Gemini error: %s", exc)
                alex_reply = "I'm having trouble responding right now. Please continue."

            # Store assistant event
            await event_store.append(session_id, "assistant", alex_reply, "chat")

            # Check if Alex signaled completion
            if "[INTERVIEW COMPLETE]" in alex_reply:
                await websocket.send_json({"type": "chat", "content": alex_reply})
                await websocket.send_json({
                    "type": "interview_complete",
                    "content": "The interview is complete. Generating your scorecard...",
                })
                break

            await websocket.send_json({"type": "chat", "content": alex_reply})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    except Exception as exc:
        logger.error("WebSocket error for session %s: %s", session_id, exc)
        try:
            await websocket.send_json({"type": "error", "content": str(exc)})
        except Exception:
            pass
