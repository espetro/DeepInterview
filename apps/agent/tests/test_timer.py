"""Timer tests: duration from room metadata, clamping, and remaining-time math.

Mirrors the style of ``test_guard.py`` — fakes only, no livekit, no real time.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from deepinterview_agent.live.guard import SessionGuard
from deepinterview_agent.shared_models import RoomMetadata
from deepinterview_agent.live.state import InterviewUserdata, remaining_time
from deepinterview_agent.worker import (
    _MAX_DURATION_SEC,
    _MIN_DURATION_SEC,
    _effective_duration_sec,
)


class _Settings:
    max_interview_duration_sec = 1200  # 20 min default


def _meta(minutes: int | None) -> RoomMetadata | None:
    if minutes is None:
        return None
    return RoomMetadata(session_id="sess_test", duration_min=minutes)


def test_duration_falls_back_to_default_without_metadata() -> None:
    assert _effective_duration_sec(None, _Settings()) == 1200
    assert _effective_duration_sec(_meta(None), _Settings()) == 1200


def test_duration_clamped_to_bounds() -> None:
    # Too short -> clamped up to 20 min.
    assert _effective_duration_sec(_meta(5), _Settings()) == _MIN_DURATION_SEC
    # Too long -> clamped down to 45 min.
    assert _effective_duration_sec(_meta(90), _Settings()) == _MAX_DURATION_SEC
    # In band -> used as-is.
    assert _effective_duration_sec(_meta(30), _Settings()) == 30 * 60
    assert _MIN_DURATION_SEC == 20 * 60
    assert _MAX_DURATION_SEC == 45 * 60


def _ud(total: float | None, start: float | None = None) -> InterviewUserdata:
    return InterviewUserdata(
        ctx=SimpleNamespace(
            plan=SimpleNamespace(questions=[]), cursor=0, answers=[]
        ),
        session_id="sess_test",
        max_duration_sec=total,
        started_at=start,
    )


def test_remaining_time_math_and_clamping() -> None:
    ud = _ud(600, start=100.0)
    assert remaining_time(ud, now=100.0) == {
        "remaining_sec": 600,
        "elapsed_sec": 0,
        "total_sec": 600,
    }
    mid = remaining_time(ud, now=250.0)
    assert mid == {"remaining_sec": 450, "elapsed_sec": 150, "total_sec": 600}
    # Never negative, even when the tick lands late.
    late = remaining_time(ud, now=9999.0)
    assert late["remaining_sec"] == 0
    assert late["elapsed_sec"] == round(9999.0 - 100.0)


def test_remaining_time_none_without_budget_or_start() -> None:
    assert remaining_time(_ud(None, start=0.0), now=5.0) is None
    assert remaining_time(_ud(600, start=None), now=5.0) is None


def test_guard_publishes_timer_on_start_and_tick() -> None:
    published: list[dict] = []
    # Clock: start read, one throttled loop tick (0s), then a due tick (35s),
    # then it stays put (the scenario closes the guard after one iteration).
    clock = iter([0.0, 0.0, 35.0])
    guard = SessionGuard(
        _FakeTimerSession(),
        _ud(600),
        max_duration_sec=600,
        max_turns=10_000,
        interval_sec=0.01,
        publish_interval_sec=30.0,
        time_fn=lambda: next(clock, 35.0),
        publish_timer=published.append,
    )

    async def _scenario() -> None:
        guard.start()
        await asyncio.sleep(0.05)
        await guard.aclose()

    asyncio.run(_scenario())

    assert published, "an initial snapshot should publish on start"
    assert published[0] == {
        "remaining_sec": 600,
        "elapsed_sec": 0,
        "total_sec": 600,
    }
    # The 0s tick is throttled (< 30s); the 35s tick is due -> publish #2.
    assert len(published) == 2
    assert published[1] == {
        "remaining_sec": 565,
        "elapsed_sec": 35,
        "total_sec": 600,
    }


def test_guard_with_zero_budget_publishes_zero_then_trips() -> None:
    """The guard is the budget authority (mirrors into userdata), so a 0s
    budget publishes a 0-remaining snapshot and trips immediately."""
    published: list[dict] = []
    guard = SessionGuard(
        _FakeTimerSession(),
        _ud(None),
        max_duration_sec=0,
        max_turns=10_000,
        interval_sec=0.0,
        time_fn=lambda: 0.0,
        publish_timer=published.append,
    )
    asyncio_run_guard(guard)
    assert published == [{"remaining_sec": 0, "elapsed_sec": 0, "total_sec": 0}]
    assert guard.tripped


def test_publish_errors_never_break_the_guard() -> None:
    def _boom(_snapshot: dict) -> None:
        raise RuntimeError("room not ready")

    guard = SessionGuard(
        _FakeTimerSession(),
        _ud(600),
        max_duration_sec=0,  # trips immediately
        max_turns=10_000,
        interval_sec=0.0,
        time_fn=lambda: 0.0,
        publish_timer=_boom,
    )
    asyncio_run_guard(guard)
    assert guard.tripped


class _FakeTimerSession:
    """Minimal session surface for the guard (say/shutdown)."""

    def __init__(self) -> None:
        self.shutdown_called = False

    async def say(self, text: str) -> None:
        pass

    def shutdown(self, *, drain: bool = True) -> None:
        self.shutdown_called = True


def asyncio_run_guard(guard: SessionGuard) -> None:
    import asyncio

    async def _drive() -> None:
        guard.start()
        assert guard._task is not None
        await guard._task

    asyncio.run(_drive())
