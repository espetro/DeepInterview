"""Offline tests for the fast prep path (``POST /api/prep?fast=true``).

The fast path must create the session, ingest the CV/JD facts into the session
knowledge store, persist difficulty/voice/duration_min in the context, and mark
the session ``ready`` — all WITHOUT invoking the LangGraph prep pipeline.
"""

from __future__ import annotations

import asyncio

from deepinterview_agent.core.deps import build_deps
from deepinterview_agent.prep import run_fast_prep, run_prep_for_session
from deepinterview_agent.shared_models import LanguageMode, PrepRequest


def _request(**overrides) -> PrepRequest:
    base = dict(
        cv_url="Senior backend engineer with 8 years of Python and Go experience, "
        "formerly at Stripe, built global payment reconciliation systems.",
        jd_text="Senior Backend Engineer building distributed payment systems in Python.",
        company="Acme Payments",
        language_mode=LanguageMode(primary="en", mixed=False),
    )
    base.update(overrides)
    return PrepRequest(**base)


def test_fast_prep_ready_without_graph(monkeypatch) -> None:
    deps = build_deps()

    def _boom(*args, **kwargs):  # the prep graph must NEVER run
        raise AssertionError("slow-path graph invoked on the fast path")

    import deepinterview_agent.prep as prep_mod

    # Guard the graph builder directly: if the fast path ever reaches the
    # LangGraph, this test fails loudly.
    monkeypatch.setattr(prep_mod, "build_prep_graph", _boom, raising=False)

    session_id = asyncio.run(run_fast_prep(_request(), deps))
    assert session_id.startswith("sess_")
    assert deps.repo.get_status(session_id) == "ready"

    ctx = asyncio.run(deps.repo.load_context(session_id))
    assert ctx is not None
    assert ctx.plan.language_mode.primary == "en"


def test_fast_prep_persists_difficulty_voice_duration() -> None:
    deps = build_deps()
    session_id = asyncio.run(
        run_fast_prep(
            _request(difficulty="hard", voice="alba", duration_min=30), deps
        )
    )
    ctx = asyncio.run(deps.repo.load_context(session_id))
    assert ctx is not None
    assert ctx.difficulty == "hard"
    assert ctx.voice == "alba"
    assert ctx.duration_min == 30


def test_fast_prep_ingests_facts(monkeypatch) -> None:
    deps = build_deps()
    ingested: list[tuple[str, list[str]]] = []
    original = deps.knowledge.ingest

    async def _spy(session_id: str, files: list[str]):
        ingested.append((session_id, files))
        return await original(session_id, files)

    monkeypatch.setattr(deps, "knowledge", deps.knowledge)
    monkeypatch.setattr(type(deps.knowledge), "ingest", staticmethod(_spy))

    session_id = asyncio.run(run_fast_prep(_request(), deps))
    assert ingested, "fast prep must ingest CV/JD facts into the knowledge store"
    assert ingested[0][0] == session_id
    joined = "\n".join(ingested[0][1])
    assert "CANDIDATE CV" in joined
    assert "JOB DESCRIPTION" in joined


def test_fast_prep_raw_text_cv_accepted() -> None:
    deps = build_deps()
    session_id = asyncio.run(run_fast_prep(_request(), deps))
    ctx = asyncio.run(deps.repo.load_context(session_id))
    assert ctx is not None  # raw pasted CV text resolves without error
    assert deps.repo.get_status(session_id) == "ready"


def test_prep_endpoint_fast_query_param() -> None:
    from fastapi.testclient import TestClient

    from deepinterview_agent.app import create_app

    client = TestClient(create_app())
    resp = client.post(
        "/api/prep?fast=true",
        json={
            "cv_url": "Experienced platform engineer, 10 years with Kubernetes and Go.",
            "jd_text": "Platform engineer role building internal tooling.",
            "company": "FastCo",
            "language_mode": {"primary": "en", "mixed": False},
            "difficulty": "easy",
            "voice": "mariam",
            "duration_min": 20,
        },
    )
    assert resp.status_code == 200
    view = client.get(f"/api/session/{resp.json()['session_id']}")
    assert view.status_code == 200
    payload = view.json()
    assert payload["status"] == "ready"
    ctx = payload["context"]
    assert ctx["difficulty"] == "easy"
    assert ctx["voice"] == "mariam"
    assert ctx["duration_min"] == 20
