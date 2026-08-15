"""
event_consumer.py — Drains EventStore → bulk MySQL write on interview end.
"""
import logging
from typing import Any

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from event_store import event_store, Event
from models import ChatEvent, ShadowReport

logger = logging.getLogger(__name__)


async def drain_and_persist(
    session_id: str,
    db: AsyncSession,
    shadow_reports_map: dict[int, dict[str, Any]] | None = None,
) -> list[Event]:
    """
    1. Drain all events from in-memory store for session_id.
    2. Bulk-insert chat_events into MySQL.
    3. Bulk-insert any shadow_reports from shadow_reports_map (keyed by sequence).

    Returns the drained events for further processing (e.g. evaluation).
    """
    events = await event_store.drain(session_id)
    if not events:
        return []

    # --- Bulk insert chat events ---
    chat_rows = [
        {
            "session_id": e.session_id,
            "sequence": e.sequence,
            "role": e.role,
            "content": e.content,
            "event_type": e.event_type,
            "metadata": e.metadata,
        }
        for e in events
    ]
    await db.execute(insert(ChatEvent), chat_rows)

    # --- Bulk insert shadow reports if provided ---
    if shadow_reports_map:
        report_rows = [
            {
                "session_id": session_id,
                "event_sequence": seq,
                **report_data,
            }
            for seq, report_data in shadow_reports_map.items()
        ]
        if report_rows:
            await db.execute(insert(ShadowReport), report_rows)

    await db.commit()
    logger.info(
        "Persisted %d chat events for session %s", len(events), session_id
    )
    return events
