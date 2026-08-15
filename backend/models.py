"""
models.py — SQLAlchemy ORM models (mirrors db/init/01_schema.sql)
"""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# InterviewSession
# ---------------------------------------------------------------------------
class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    status: Mapped[str] = mapped_column(
        Enum("setup", "active", "completed", "abandoned"), default="setup"
    )
    job_desc: Mapped[str] = mapped_column(Text, nullable=False)
    resume: Mapped[str] = mapped_column(Text, nullable=False)
    readiness_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    chat_events: Mapped[list["ChatEvent"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    shadow_reports: Mapped[list["ShadowReport"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    evaluation: Mapped["Evaluation | None"] = relationship(
        back_populates="session", cascade="all, delete-orphan", uselist=False
    )
    resume_claims: Mapped[list["ResumeClaim"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    job_fit_analysis: Mapped["JobFitAnalysis | None"] = relationship(
        back_populates="session", cascade="all, delete-orphan", uselist=False
    )


# ---------------------------------------------------------------------------
# InterviewQuestion
# ---------------------------------------------------------------------------
class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE")
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Enum("Behavioral", "Technical"), nullable=False)
    focus_area: Mapped[str] = mapped_column(String(255), nullable=False)

    session: Mapped["InterviewSession"] = relationship(back_populates="questions")


# ---------------------------------------------------------------------------
# ChatEvent
# ---------------------------------------------------------------------------
class ChatEvent(Base):
    __tablename__ = "chat_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE")
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(Enum("user", "assistant"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), default="chat")
    metadata_: Mapped[Any | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    session: Mapped["InterviewSession"] = relationship(back_populates="chat_events")


# ---------------------------------------------------------------------------
# ShadowReport
# ---------------------------------------------------------------------------
class ShadowReport(Base):
    __tablename__ = "shadow_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE")
    )
    event_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    correctness_score: Mapped[int] = mapped_column(Integer, nullable=False)
    time_complexity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    space_complexity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    issues: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    session: Mapped["InterviewSession"] = relationship(back_populates="shadow_reports")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------
class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True
    )
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    star_breakdown: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    strengths: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    weaknesses: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    ideal_rewrite: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    session: Mapped["InterviewSession"] = relationship(back_populates="evaluation")


# ---------------------------------------------------------------------------
# ResumeClaim
# ---------------------------------------------------------------------------
class ResumeClaim(Base):
    __tablename__ = "resume_claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE")
    )
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    skill_tags: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    importance: Mapped[int | None] = mapped_column(Integer, nullable=True)

    session: Mapped["InterviewSession"] = relationship(back_populates="resume_claims")


# ---------------------------------------------------------------------------
# JobFitAnalysis
# ---------------------------------------------------------------------------
class JobFitAnalysis(Base):
    __tablename__ = "job_fit_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True
    )
    required_skills: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    readiness_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_gaps: Mapped[Any | None] = mapped_column(JSON, nullable=True)

    session: Mapped["InterviewSession"] = relationship(
        back_populates="job_fit_analysis"
    )
