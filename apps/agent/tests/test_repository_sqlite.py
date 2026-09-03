"""Offline tests for the local durable ``SqliteRepository``.

Mirrors the Memory/Supabase tests in ``test_repository.py``: every protocol
method is exercised against a tmp_path SQLite file, including cross-instance
(what the API process vs. the live worker see) visibility and the
``get_repository`` factory precedence.
"""

from __future__ import annotations

import asyncio
import json

from deepinterview_agent.core.adapters.mock import build_mock
from deepinterview_agent.core.config import Settings
from deepinterview_agent.core.persistence.repository import (
    MemoryRepository,
    SqliteRepository,
    SupabaseRepository,
    get_repository,
)
from deepinterview_agent.shared_models import (
    AnswerRecord,
    InterviewContext,
    LanguageMode,
    PrepRequest,
    ScoreCard,
)


def _run(coro):
    return asyncio.run(coro)


def _prep_request() -> PrepRequest:
    return PrepRequest(
        cv_url="https://example.com/cv.pdf",
        jd_text="We are hiring a backend engineer.",
        company="Acme Payments",
        language_mode=LanguageMode(primary="en", mixed=False),
    )


def test_round_trip_and_update_after_save(tmp_path) -> None:
    repo = SqliteRepository(str(tmp_path / "sessions.db"))
    sid = _run(repo.create_session(_prep_request()))
    assert sid.startswith("sess_")
    assert repo.get_status(sid) == "prep"

    ctx = build_mock(InterviewContext)
    assert isinstance(ctx, InterviewContext)
    _run(repo.save_context(sid, ctx))
    loaded = _run(repo.load_context(sid))
    assert loaded is not None
    assert loaded.model_dump() == ctx.model_dump()

    # Update-after-save: a second write of the same doc overwrites cleanly.
    ctx2 = ctx.model_copy(deep=True)
    _run(repo.save_context(sid, ctx2))
    loaded2 = _run(repo.load_context(sid))
    assert loaded2 is not None
    assert loaded2.model_dump() == ctx2.model_dump()

    _run(repo.update_status(sid, "complete"))
    assert repo.get_status(sid) == "complete"


def test_full_protocol_surface(tmp_path) -> None:
    repo = SqliteRepository(str(tmp_path / "sessions.db"))
    sid = _run(repo.create_session(_prep_request()))

    ctx = build_mock(InterviewContext)
    _run(repo.save_context(sid, ctx))
    answer = AnswerRecord(
        question_id="q1",
        transcript="A spoken answer.",
        started_at="2026-06-08T09:00:00Z",
        ended_at="2026-06-08T09:01:00Z",
    )
    _run(repo.append_answer(sid, answer))
    # append_answer mutates the canonical context blob too (Memory semantics).
    loaded_ctx = _run(repo.load_context(sid))
    assert loaded_ctx is not None
    assert loaded_ctx.answers[-1].model_dump() == answer.model_dump()

    sc = build_mock(ScoreCard)
    _run(repo.save_scorecard(sid, sc))
    _run(repo.save_transcript(sid, [{"role": "agent", "text": "hi"}]))
    _run(repo.save_coach_transcript(sid, [{"role": "coach", "text": "drill"}]))
    _run(repo.mark_progress(sid, "cv_analysis"))
    _run(repo.mark_progress(sid, "cv_analysis"))  # idempotent
    _run(repo.add_warnings(sid, ["JD text is very short."]))
    _run(repo.add_warnings(sid, ["JD text is very short."]))  # idempotent
    _run(repo.update_status(sid, "complete"))

    view = _run(repo.get_session_view(sid))
    assert view is not None
    assert (view.session_id, view.status) == (sid, "complete")
    assert view.progress == ["cv_analysis"]
    assert view.prep_warnings == ["JD text is very short."]
    assert view.context is not None
    expected_ctx = ctx.model_copy(deep=True, update={})
    expected_ctx.answers.append(answer)
    assert view.context.model_dump() == expected_ctx.model_dump()
    assert view.scorecard is not None
    assert view.scorecard.model_dump() == sc.model_dump()

    # A session with no saved context reads as None; unknown ids do not raise.
    sid2 = _run(repo.create_session(_prep_request()))
    assert _run(repo.load_context(sid2)) is None
    assert _run(repo.load_context("sess_missing")) is None
    assert _run(repo.get_session_view("sess_missing")) is None


def test_multiprocess_visibility_second_instance_same_db(tmp_path) -> None:
    """Simulates the API process vs. the live worker: two independent
    SqliteRepository instances on the same file must share all writes."""
    db = str(tmp_path / "sessions.db")
    writer = SqliteRepository(db)
    sid = _run(writer.create_session(_prep_request()))
    ctx = build_mock(InterviewContext)
    _run(writer.save_context(sid, ctx))
    _run(writer.update_status(sid, "complete"))
    _run(writer.mark_progress(sid, "cv_analysis"))

    reader = SqliteRepository(db)
    loaded = _run(reader.load_context(sid))
    assert loaded is not None
    assert loaded.model_dump() == ctx.model_dump()
    assert reader.get_status(sid) == "complete"
    view = _run(reader.get_session_view(sid))
    assert view is not None
    assert view.status == "complete"
    assert view.progress == ["cv_analysis"]

    # And the reader can write back for the writer to see.
    _run(reader.mark_progress(sid, "scoring"))
    view2 = _run(writer.get_session_view(sid))
    assert view2 is not None
    assert view2.progress == ["cv_analysis", "scoring"]


def test_stores_json_docs(tmp_path) -> None:
    """The stored row is a single JSON document (inspectable, debuggable)."""
    import sqlite3

    db = str(tmp_path / "sessions.db")
    repo = SqliteRepository(db)
    sid = _run(repo.create_session(_prep_request()))
    conn = sqlite3.connect(db)
    try:
        row = conn.execute(
            "SELECT data FROM sessions WHERE session_id = ?", (sid,)
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    doc = json.loads(row[0])
    assert doc["id"] == sid
    assert doc["status"] == "prep"


def test_factory_precedence(tmp_path) -> None:
    # sqlite_sessions_path set -> SqliteRepository, even alongside Supabase.
    settings = Settings(
        sqlite_sessions_path=str(tmp_path / "sessions.db"),
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="k",
    )
    assert isinstance(get_repository(settings), SqliteRepository)

    # Path empty -> previous behavior: Supabase when fully configured.
    settings = Settings(
        sqlite_sessions_path="",
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="k",
    )
    assert isinstance(get_repository(settings), SupabaseRepository)

    # Path empty and no Supabase -> the in-memory singleton (unchanged).
    settings = Settings(sqlite_sessions_path="")
    repo = get_repository(settings)
    assert isinstance(repo, MemoryRepository)
    assert get_repository(settings) is repo  # same singleton
