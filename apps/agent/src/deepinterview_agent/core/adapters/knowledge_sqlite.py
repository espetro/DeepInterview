"""Local sqlite-vec knowledge adapter (replacement for the LightRAG sidecar).

``SqliteVecKnowledge`` stores document chunks + embeddings in a single sqlite
file (setting ``sqlite_kb_path``, default ``.deepinterview/kb.sqlite3``). Query
and document embeddings come from the shared embeddings adapter
(``get_embeddings(settings)``), so the mock provider keeps everything offline;
with real providers (openai) it becomes genuine semantic search.

``get_knowledge(settings)`` prefers :class:`SqliteVecKnowledge` whenever
``sqlite_kb_path`` is set (it is, by default). ``HttpKnowledge`` (LightRAG) is
kept but unreachable unless someone explicitly sets ``lightrag_url`` AND clears
``sqlite_kb_path`` (``SQLITE_KB_PATH=``); the LightRAG Docker sidecar is no
longer part of the default local stack.
"""

from __future__ import annotations

import sqlite3
import struct
from pathlib import Path
from typing import TYPE_CHECKING

import sqlite_vec

from ...shared_models import Citation
from ..logging import get_logger
from .embeddings import get_embeddings
from .knowledge import _stub_track_id

if TYPE_CHECKING:
    from ..config import Settings

log = get_logger(__name__)

# Chunking: ~500 token windows with ~50 overlap (whitespace tokens ≈ words).
_CHUNK_TOKENS = 500
_CHUNK_OVERLAP = 50
# KNN results per query.
_TOP_K = 6

_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    position INTEGER NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON chunks(user_id);
"""


def _chunk_text(text: str) -> list[str]:
    """Split ``text`` into ~500-token windows with ~50-token overlap.

    Tokens are whitespace-split words (close enough to model tokens for chunking
    purposes and fully deterministic). Overlapping windows guarantee chunks that
    straddle a window boundary are still embedded somewhere intact.
    """
    words = text.split()
    if not words:
        return []
    step = _CHUNK_TOKENS - _CHUNK_OVERLAP
    chunks: list[str] = []
    for start in range(0, len(words), step):
        window = words[start : start + _CHUNK_TOKENS]
        chunks.append(" ".join(window))
        if start + _CHUNK_TOKENS >= len(words):
            break
    return chunks


def _parse_file(entry: str) -> tuple[str, str]:
    """Return ``(source, text)`` for one ingest entry.

    Mirrors the old LightRAG contract: an entry is either raw text or a fetchable
    URL (http/https). URLs are fetched and, where possible, converted to plain
    text via markitdown (already a dependency for CV parsing); anything it can't
    parse falls back to the raw response body. Raw-text entries pass through.
    """
    if entry.startswith(("http://", "https://")):
        import httpx

        resp = httpx.get(entry, timeout=30.0, follow_redirects=True)
        resp.raise_for_status()
        body = resp.text
        try:
            from markitdown import MarkItDown

            text = MarkItDown().convert_stream(
                __import__("io").BytesIO(body.encode("utf-8"))
            ).text_content
        except Exception:  # noqa: BLE001 - any parser failure degrades to raw text
            log.warning("markitdown failed for %s; storing raw body", entry)
            text = body
        return (entry, text)
    # Raw text: derive a stable pseudo-source so citations remain meaningful.
    return ("inline-text", entry)


class SqliteVecKnowledge:
    """Local RAG over sqlite + sqlite-vec; embeddings via the shared adapter."""

    def __init__(self, db_path: str | Path, embeddings) -> None:
        self._path = Path(db_path)
        self._embeddings = embeddings
        self._dim: int | None = None
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = self._connect()
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, check_same_thread=False)
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        return conn

    def _ensure_vec_table(self, dim: int) -> None:
        """Create the vec virtual table once, sized to the embedding dim."""
        if self._dim == dim:
            return
        if self._dim is not None:
            raise RuntimeError(
                f"embedding dim changed from {self._dim} to {dim}; "
                "delete the KB file or keep one provider per DB"
            )
        self._conn.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0("
            f"chunk_id INTEGER PRIMARY KEY, embedding float[{dim}])"
        )
        self._dim = dim

    @staticmethod
    def _serialize(vec: list[float]) -> bytes:
        return struct.pack(f"<{len(vec)}f", *vec)

    async def search(
        self, user_id: str, query: str, lang: str
    ) -> tuple[str, list[Citation]]:
        (qvec,) = await self._embeddings.embed([query])
        self._ensure_vec_table(len(qvec))
        rows = self._conn.execute(
            "SELECT c.source, c.position, c.text, c.user_id "
            "FROM chunk_vectors v JOIN chunks c ON c.id = v.chunk_id "
            "WHERE v.embedding MATCH ? AND k = ? AND c.user_id = ? "
            "ORDER BY distance LIMIT ?",
            (self._serialize(qvec), _TOP_K * 8, user_id, _TOP_K),
        ).fetchall()
        if not rows:
            return ("", [])
        answer = "\n\n".join(text for _, _, text, _ in rows)
        citations = [
            Citation(
                title=source,
                url=f"kb://{source}#chunk-{position}",
                snippet=text[:200],
            )
            for source, position, text, _ in rows
        ]
        return (answer, citations)

    async def ingest(self, user_id: str, files: list[str]) -> str:
        docs: list[tuple[str, str]] = [_parse_file(f) for f in files]
        chunk_texts: list[str] = []
        meta: list[tuple[int, int]] = []  # (doc index, chunk position)
        for i, (_, text) in enumerate(docs):
            for pos, chunk in enumerate(_chunk_text(text)):
                chunk_texts.append(chunk)
                meta.append((i, pos))
        if chunk_texts:
            vectors = await self._embeddings.embed(chunk_texts)
            self._ensure_vec_table(len(vectors[0]))
            cur = self._conn.cursor()
            doc_ids: list[int] = []
            for source, text in docs:
                cur.execute(
                    "INSERT INTO documents(user_id, source, content) VALUES (?, ?, ?)",
                    (user_id, source, text),
                )
                doc_ids.append(cur.lastrowid)
            for (i, pos), text, vec in zip(meta, chunk_texts, vectors):
                source = docs[i][0]
                cur.execute(
                    "INSERT INTO chunks(document_id, user_id, source, position, text) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (doc_ids[i], user_id, source, pos, text),
                )
                cur.execute(
                    "INSERT INTO chunk_vectors(chunk_id, embedding) VALUES (?, ?)",
                    (cur.lastrowid, self._serialize(vec)),
                )
            self._conn.commit()
            log.info(
                "sqlite-kb: ingested %d file(s) as %d chunks for user %s",
                len(docs), len(chunk_texts), user_id,
            )
        return _stub_track_id(user_id, files)


def get_knowledge(settings: Settings):
    """Choose a knowledge client.

    Prefers the local :class:`SqliteVecKnowledge` (``sqlite_kb_path`` is set by
    default). :class:`HttpKnowledge` (LightRAG) is kept for compatibility but is
    unreachable unless ``SQLITE_KB_PATH`` is cleared AND ``LIGHTRAG_URL`` is set.
    """
    kb_path = getattr(settings, "sqlite_kb_path", None)
    if kb_path:
        return SqliteVecKnowledge(kb_path, get_embeddings(settings))
    url = getattr(settings, "lightrag_url", None)
    if url:
        from .knowledge import HttpKnowledge

        return HttpKnowledge(url, getattr(settings, "lightrag_api_secret", None))
    from .knowledge import MockKnowledge

    log.info("No sqlite_kb_path or lightrag_url; using MockKnowledge (offline).")
    return MockKnowledge()
