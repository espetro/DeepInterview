"""Tests for the whiteboard snapshot intake + renderer (live/whiteboard.py)."""

from __future__ import annotations

import json

import pytest

from deepinterview_agent.live.whiteboard import (
    render_whiteboard_text,
    store_whiteboard_snapshot,
)


class _Ud:
    """Minimal stand-in for InterviewUserdata."""

    def __init__(self) -> None:
        self.whiteboard_snapshot: dict | None = None


def _snapshot(shapes, **extra):
    return {"at": 1_700_000_000_000, "shapeCount": len(shapes), "shapes": shapes, **extra}


class TestStoreWhiteboardSnapshot:
    def test_stores_valid_json(self):
        ud = _Ud()
        assert store_whiteboard_snapshot(ud, json.dumps(_snapshot([]))) is True
        assert ud.whiteboard_snapshot is not None
        assert ud.whiteboard_snapshot["shapeCount"] == 0

    def test_accepts_bytes(self):
        ud = _Ud()
        assert store_whiteboard_snapshot(ud, b'{"shapes":[]}') is True

    def test_replaces_previous(self):
        ud = _Ud()
        store_whiteboard_snapshot(ud, json.dumps(_snapshot([{"id": "a"}])))
        store_whiteboard_snapshot(ud, json.dumps(_snapshot([{"id": "b"}, {"id": "c"}])))
        assert ud.whiteboard_snapshot["shapeCount"] == 2

    @pytest.mark.parametrize("payload", [None, "", "not json", "[]", "42", b"\xff\xfe"])
    def test_malformed_payloads_rejected(self, payload):
        ud = _Ud()
        assert store_whiteboard_snapshot(ud, payload) is False
        assert ud.whiteboard_snapshot is None


class TestRenderWhiteboardText:
    def test_none_is_empty_message(self):
        assert render_whiteboard_text(None) == "The whiteboard is empty."

    def test_empty_shapes_is_empty_message(self):
        assert render_whiteboard_text(_snapshot([])) == "The whiteboard is empty."

    def test_inventory_counts_by_type(self):
        snap = _snapshot(
            [
                {"id": "shape:a", "type": "text", "text": "Design"},
                {"id": "shape:b", "type": "geo", "text": "Step 1"},
                {"id": "shape:c", "type": "geo"},
                {"id": "shape:d", "type": "arrow", "from": "shape:b", "to": "shape:e"},
            ]
        )
        out = render_whiteboard_text(snap)
        assert "4 shapes" in out
        assert "2 geo" in out
        assert "1 text" in out
        assert "1 arrow" in out
        assert "- text: Design" in out
        assert "- geo: Step 1" in out
        assert "shape:b -> shape:e" in out

    def test_board_without_text_says_so(self):
        out = render_whiteboard_text(_snapshot([{"id": "a", "type": "ellipse"}]))
        assert "no text labels" in out

    def test_long_text_is_truncated(self):
        out = render_whiteboard_text(
            _snapshot([{"id": "a", "type": "text", "text": "x" * 500}])
        )
        assert "…" in out
        assert "x" * 500 not in out

    def test_truncated_flag_is_reported(self):
        out = render_whiteboard_text(_snapshot([{"id": "a", "type": "geo"}], truncated=True))
        assert "omitted" in out

    def test_count_only_payload_when_all_shapes_dropped(self):
        out = render_whiteboard_text({"shapeCount": 57, "truncated": True, "shapes": []})
        assert "57 shape(s)" in out

    def test_degrades_on_malformed_shapes(self):
        out = render_whiteboard_text({"shapes": ["junk", 3, None, {"type": "geo"}]})
        assert "1 shapes" in out or "shapes" in out
