"""Whiteboard snapshot intake + text rendering (WP-5, v1 read-only).

The web live room publishes a pruned tldraw snapshot on the LiveKit data
channel under the ``"whiteboard"`` topic (see
``apps/web/components/interview/whiteboard-store.ts``). This module holds the
worker-side half: a data-handler that stores the latest snapshot on
:class:`~deepinterview_agent.live.state.InterviewUserdata`, and a pure
snapshot->text renderer the Interviewer's ``read_whiteboard`` tool uses to show
the board to the model.

The renderer is a pure function over the wire JSON so it is fully testable
offline (no livekit imports needed for that path).
"""

from __future__ import annotations

import json
from typing import Any

# The data-channel topic the browser publishes whiteboard snapshots on.
WHITEBOARD_TOPIC = "whiteboard"

# Per-text ceiling in the rendered output — a board can hold long notes; the
# live prompt budget must not blow up because the candidate pasted an essay.
_MAX_TEXT_LEN = 200


def store_whiteboard_snapshot(ud: Any, payload: str | bytes) -> bool:
    """Parse and store a whiteboard snapshot on the session userdata.

    Accepts the raw data-packet payload (str or bytes). Malformed payloads are
    dropped silently (with ``False``) — the whiteboard is auxiliary context and
    must never disturb the live loop. Returns ``True`` when a snapshot was
    stored.
    """
    try:
        snapshot = json.loads(payload)
    except (ValueError, TypeError):
        return False
    if not isinstance(snapshot, dict):
        return False
    # Keep whatever arrived — the renderer validates field by field, so a
    # partial/older browser payload degrades gracefully instead of bouncing.
    ud.whiteboard_snapshot = snapshot
    return True


def render_whiteboard_text(snapshot: dict[str, Any] | None) -> str:
    """Render a stored snapshot dict as a compact textual inventory.

    Shape counts per type, every text content (truncated), and arrow
    connections. Pure + deterministic; returns the clear "empty" string when
    there is nothing drawn yet.
    """
    if not snapshot:
        return "The whiteboard is empty."

    shapes = snapshot.get("shapes")
    if not isinstance(shapes, list):
        return "The whiteboard is empty."

    typed: list[dict[str, Any]] = [s for s in shapes if isinstance(s, dict)]

    if not typed:
        truncated = bool(snapshot.get("truncated"))
        if truncated or snapshot.get("shapeCount"):
            return (
                "The whiteboard contains "
                f"{snapshot.get('shapeCount', '?')} shape(s) too large to "
                "transmit in detail."
            )
        return "The whiteboard is empty."

    # Inventory: counts per type, in first-seen order (stable for tests).
    order: list[str] = []
    counts: dict[str, int] = {}
    for s in typed:
        t = str(s.get("type") or "unknown")
        if t not in counts:
            order.append(t)
            counts[t] = 0
        counts[t] += 1
    inventory = ", ".join(f"{counts[t]} {t}" for t in order)

    lines = [f"Whiteboard contents ({len(typed)} shapes: {inventory}):"]

    texts: list[str] = []
    arrows: list[str] = []
    for s in typed:
        text = s.get("text")
        if isinstance(text, str) and text.strip():
            content = text.strip()
            if len(content) > _MAX_TEXT_LEN:
                content = content[:_MAX_TEXT_LEN] + "…"
            texts.append(f"- {s.get('type', '?')}: {content}")
        if s.get("type") == "arrow" and (s.get("from") or s.get("to")):
            arrows.append(f"- arrow: {s.get('from', '?')} -> {s.get('to', '?')}")

    if texts:
        lines.append("Text on the board:")
        lines.extend(texts)
    else:
        lines.append("(no text labels on the board)")

    if arrows:
        lines.append("Arrows (shape ids):")
        lines.extend(arrows)

    if snapshot.get("truncated"):
        lines.append(
            "(note: the board was large, some shapes were omitted from this view)"
        )
    return "\n".join(lines)
