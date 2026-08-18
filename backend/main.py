"""
main.py — FastAPI application factory with lifespan, CORS, and all routers mounted.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Annotated

from fastapi import FastAPI, WebSocket, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import AsyncSessionFactory, engine, Base
from routers import interview, analysis, sessions, code
from services.gemini import GeminiAPIError
from websocket.chat import interview_ws_handler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Create DB tables on startup (idempotent — schema already created by Docker)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("InterviewOS backend started. MySQL connected.")
    yield
    await engine.dispose()
    logger.info("InterviewOS backend shut down.")


app = FastAPI(
    title="InterviewOS API",
    version="1.0.0",
    description="Mock Interview Platform — Event-Sourced Architecture",
    lifespan=lifespan,
)


@app.exception_handler(GeminiAPIError)
async def gemini_api_error_handler(request: Request, exc: GeminiAPIError) -> JSONResponse:
    logger.warning("GeminiAPIError handled: %s (status code %d)", exc, exc.status_code)
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        settings.next_public_api_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# REST routers
# ---------------------------------------------------------------------------
app.include_router(interview.router)
app.include_router(analysis.router)
app.include_router(sessions.router)
app.include_router(code.router)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------
@app.websocket("/ws/interview/{session_id}")
async def ws_interview(websocket: WebSocket, session_id: str) -> None:
    async with AsyncSessionFactory() as db:
        await interview_ws_handler(websocket, session_id, db)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "1.0.0"}
