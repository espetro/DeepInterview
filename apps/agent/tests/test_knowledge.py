"""Offline tests for the knowledge adapter (WP-8 agent client).

These import ONLY ``core.adapters.knowledge`` — never ``live.kb_tool`` (which needs
the livekit extra) — so the suite stays green with livekit absent.
"""

from __future__ import annotations

import asyncio

import pytest

from deepinterview_agent.core.adapters.knowledge import (
    HttpKnowledge,
    KnowledgeClient,
    MockKnowledge,
    get_knowledge,
)
from deepinterview_agent.core.config import Settings
from deepinterview_agent.shared_models import Citation


@pytest.fixture(autouse=True)
def _no_local_dotenv(monkeypatch, tmp_path):
    """Settings() reads ``.env`` cwd-relative — a dev machine's LIGHTRAG_URL
    must not leak into the get_knowledge() default-selection tests."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LIGHTRAG_URL", raising=False)


def _run(coro):
    return asyncio.run(coro)


def test_mock_knowledge_returns_answer_and_shared_citations() -> None:
    answer, citations = _run(MockKnowledge().search("u1", "system design", "en"))
    assert isinstance(answer, str) and answer
    assert "system design" in answer
    assert len(citations) == 2
    assert all(isinstance(c, Citation) for c in citations)


def test_mock_knowledge_is_deterministic() -> None:
    a = _run(MockKnowledge().search("u1", "graphs", "en"))
    b = _run(MockKnowledge().search("u1", "graphs", "en"))
    assert a[0] == b[0]
    assert [c.model_dump() for c in a[1]] == [c.model_dump() for c in b[1]]


def test_mock_knowledge_satisfies_protocol() -> None:
    assert isinstance(MockKnowledge(), KnowledgeClient)
    assert isinstance(HttpKnowledge("http://localhost:9621"), KnowledgeClient)


def test_get_knowledge_returns_mock_without_lightrag_url(monkeypatch) -> None:
    # With sqlite_kb_path cleared AND no LIGHTRAG_URL, get_knowledge falls all
    # the way back to MockKnowledge.
    monkeypatch.delenv("LIGHTRAG_URL", raising=False)
    monkeypatch.setattr(Settings, "model_fields", Settings.model_fields)  # no-op guard
    client = get_knowledge(Settings(sqlite_kb_path=""))
    assert isinstance(client, MockKnowledge)
    # And it yields a (answer, citations) tuple of shared Citation instances.
    answer, citations = _run(client.search("u1", "behavioral", "en"))
    assert isinstance(answer, str)
    assert all(isinstance(c, Citation) for c in citations)


def test_get_knowledge_returns_http_with_lightrag_url(monkeypatch) -> None:
    monkeypatch.setenv("LIGHTRAG_URL", "http://lightrag:9621")
    # HttpKnowledge only wins when the local sqlite store is disabled.
    client = get_knowledge(Settings(sqlite_kb_path=""))
    assert isinstance(client, HttpKnowledge)


def test_mock_knowledge_ingest_returns_deterministic_stub() -> None:
    track = _run(MockKnowledge().ingest("sess_abc", ["doc one", "doc two"]))
    assert track == "trk-sess_abc-2"
    # Stable across calls (no uuid4/hash) so callers/tests can assert on it.
    assert track == _run(MockKnowledge().ingest("sess_abc", ["doc one", "doc two"]))


# --- SqliteVecKnowledge (local RAG, replaces the LightRAG sidecar) ----------

from deepinterview_agent.core.adapters.embeddings import get_embeddings
from deepinterview_agent.core.adapters.knowledge_sqlite import SqliteVecKnowledge


def _sqlite_client(tmp_path) -> SqliteVecKnowledge:
    return SqliteVecKnowledge(tmp_path / "kb.sqlite3", get_embeddings(Settings()))


def test_sqlite_kb_is_offline_roundtrip(tmp_path) -> None:
    kb = _sqlite_client(tmp_path)
    track = _run(kb.ingest("u1", ["The Eiffel Tower is in Paris. " * 10]))
    assert track == "trk-u1-1"
    answer, citations = _run(kb.search("u1", "Eiffel Tower location", "en"))
    assert "Eiffel" in answer
    assert len(citations) >= 1
    assert all(isinstance(c, Citation) for c in citations)
    assert citations[0].url.startswith("kb://")


def test_sqlite_kb_empty_store_returns_empty(tmp_path) -> None:
    kb = _sqlite_client(tmp_path)
    answer, citations = _run(kb.search("u1", "anything", "en"))
    assert answer == ""
    assert citations == []


def test_sqlite_kb_user_isolation(tmp_path) -> None:
    kb = _sqlite_client(tmp_path)
    _run(kb.ingest("u1", ["Kubernetes orchestrates containers."]))
    answer, citations = _run(kb.search("u2", "Kubernetes containers", "en"))
    assert answer == ""
    assert citations == []


def test_sqlite_kb_satisfies_protocol(tmp_path) -> None:
    assert isinstance(_sqlite_client(tmp_path), KnowledgeClient)


def test_sqlite_kb_persists_across_instances(tmp_path) -> None:
    db = tmp_path / "kb.sqlite3"
    _run(SqliteVecKnowledge(db, get_embeddings(Settings())).ingest(
        "u1", ["Postgres is a relational database."]
    ))
    answer, _ = _run(SqliteVecKnowledge(db, get_embeddings(Settings())).search(
        "u1", "Postgres relational", "en"
    ))
    assert "Postgres" in answer


def test_get_knowledge_defaults_to_sqlite_vec(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("LIGHTRAG_URL", raising=False)
    monkeypatch.delenv("SQLITE_KB_PATH", raising=False)
    monkeypatch.chdir(tmp_path)
    client = get_knowledge(Settings())
    assert isinstance(client, SqliteVecKnowledge)
