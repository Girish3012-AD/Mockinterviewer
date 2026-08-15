"""
event_store.py — In-memory event queue (asyncio-safe)

Zero writes to MySQL during a live interview.
All events accumulate here; EventConsumer drains them on interview end.
"""
import asyncio
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Event:
    session_id: str
    sequence: int
    role: str                    # 'user' | 'assistant'
    content: str
    event_type: str = "chat"     # 'chat' | 'code_submit' | 'code_result'
    metadata: dict[str, Any] | None = None


class EventStore:
    """Thread-safe, asyncio-safe in-memory event store keyed by session_id."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._queues: dict[str, list[Event]] = {}
        self._counters: dict[str, int] = {}

    async def create_session(self, session_id: str) -> None:
        async with self._lock:
            if session_id not in self._queues:
                self._queues[session_id] = []
                self._counters[session_id] = 0

    async def append(
        self,
        session_id: str,
        role: str,
        content: str,
        event_type: str = "chat",
        metadata: dict[str, Any] | None = None,
    ) -> Event:
        async with self._lock:
            seq = self._counters.get(session_id, 0) + 1
            self._counters[session_id] = seq
            event = Event(
                session_id=session_id,
                sequence=seq,
                role=role,
                content=content,
                event_type=event_type,
                metadata=metadata,
            )
            self._queues.setdefault(session_id, []).append(event)
            return event

    async def drain(self, session_id: str) -> list[Event]:
        """Remove and return all events for a session (call once on interview end)."""
        async with self._lock:
            events = self._queues.pop(session_id, [])
            self._counters.pop(session_id, None)
            return events

    async def get_history(self, session_id: str) -> list[Event]:
        """Return a snapshot of events WITHOUT removing them (for WS chat history)."""
        async with self._lock:
            return list(self._queues.get(session_id, []))

    async def session_exists(self, session_id: str) -> bool:
        async with self._lock:
            return session_id in self._queues


# Singleton — imported everywhere
event_store = EventStore()
