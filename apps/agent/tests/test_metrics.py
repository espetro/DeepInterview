"""Tests for the metrics aggregation over the local JSONL trace store."""

from __future__ import annotations

import json
from pathlib import Path

from deepinterview_agent.api.metrics import percentile, summarize


def _write_trace(d: Path, trace_id: str, events: list[dict]) -> None:
    d.mkdir(parents=True, exist_ok=True)
    with open(d / f"{trace_id}.jsonl", "w", encoding="utf-8") as fh:
        for ev in events:
            fh.write(json.dumps(ev) + "\n")


def _trace_events(
    trace_id: str,
    session_id: str | None,
    span_name: str,
    durations: list[float],
    *,
    span_error: bool = False,
    llm_latency: float | None = None,
    llm_ok: bool = True,
) -> list[dict]:
    """Emit shapes matching core.tracing exactly."""
    evs: list[dict] = [
        {"type": "trace_start", "trace_id": trace_id, "name": "prep",
         "session_id": session_id, "ts": "2026-01-01T00:00:00+00:00", "metadata": {}}
    ]
    for i, dur in enumerate(durations):
        sid = f"sp_{i:08x}"
        evs.append({"type": "span_start", "trace_id": trace_id, "span_id": sid,
                    "parent_id": None, "name": span_name, "ts": "t", "attrs": {}})
        end: dict = {"type": "span_end", "trace_id": trace_id, "span_id": sid,
                     "name": span_name, "ts": "t", "duration_ms": dur, "status": "ok"}
        if span_error:
            end["status"] = "error"
            end["error"] = "ValueError: boom"
        evs.append(end)
        if llm_latency is not None:
            llm: dict = {"type": "llm_call", "trace_id": trace_id, "span_id": sid,
                         "ts": "t", "provider": "openai", "model": "gpt-5",
                         "method": "complete_json", "schema": "X",
                         "prompt_chars": 100, "latency_ms": llm_latency, "ok": llm_ok}
            if not llm_ok:
                llm["error"] = "RateLimitError: slow down"
            evs.append(llm)
    evs.append({"type": "trace_end", "trace_id": trace_id, "name": "prep",
                "session_id": session_id, "ts": "t", "duration_ms": sum(durations),
                "status": "error" if span_error else "ok"})
    return evs


class TestPercentile:
    def test_basic(self):
        assert percentile([1.0, 2.0, 3.0, 4.0], 50) == 2.0
        assert percentile([1.0, 2.0, 3.0, 4.0], 95) == 4.0
        assert percentile([], 50) == 0.0
        assert percentile([7.0], 95) == 7.0

    def test_p95_interpolates_to_nearest_rank(self):
        vals = list(range(1, 101))  # 1..100
        assert percentile(vals, 95) == 95
        assert percentile(vals, 50) == 50


class TestSummarize:
    def test_aggregates_durations_and_errors(self, tmp_path: Path):
        d = tmp_path / "traces"
        _write_trace(d, "tr_aaa", _trace_events("tr_aaa", "s1", "post.evaluate",
                                                [10.0, 20.0, 100.0]))
        _write_trace(d, "tr_bbb", _trace_events("tr_bbb", "s2", "post.evaluate",
                                                [30.0], span_error=True))
        s = summarize(d)
        assert s["trace_count"] == 2
        assert s["error_rate"] == 0.5
        stage = s["stages"]["post.evaluate"]
        assert stage["count"] == 4
        assert stage["p50"] == 20.0  # [10,20,30,100] -> nearest-rank idx 2
        assert stage["p95"] == 100.0
        assert stage["max"] == 100.0
        assert s["span_error_count"] == 1
        assert s["wall_clock_ms"]["max"] == 130.0

    def test_llm_metrics(self, tmp_path: Path):
        d = tmp_path / "traces"
        _write_trace(d, "tr_aaa", _trace_events("tr_aaa", "s1", "prep.x", [5.0],
                                                llm_latency=120.0))
        _write_trace(d, "tr_bbb", _trace_events("tr_bbb", "s1", "prep.x", [5.0],
                                                llm_latency=40.0, llm_ok=False))
        s = summarize(d, session_id="s1")
        assert s["llm"]["calls"] == 2
        assert s["llm"]["errors"] == 1
        assert s["llm"]["prompt_chars"] == 200
        assert s["llm"]["p50_ms"] == 40.0  # nearest-rank p50 of [40,120]
        assert s["llm"]["p95_ms"] == 120.0

    def test_session_filter(self, tmp_path: Path):
        d = tmp_path / "traces"
        _write_trace(d, "tr_aaa", _trace_events("tr_aaa", "s1", "a", [10.0]))
        _write_trace(d, "tr_bbb", _trace_events("tr_bbb", "s2", "b", [10.0]))
        s = summarize(d, session_id="s2")
        assert s["trace_count"] == 1
        assert list(s["stages"]) == ["b"]

    def test_last_n_bounds_scan(self, tmp_path: Path):
        d = tmp_path / "traces"
        for i in range(6):
            p = d / f"tr_{i}.jsonl"
            _write_trace(d, f"tr_{i}", _trace_events(f"tr_{i}", None, "x", [1.0]))
            p.touch()  # re-stamp mtime so tr_5 is newest
        s = summarize(d, last_n=2)
        assert s["trace_count"] == 2
        assert s["stages"]["x"]["count"] == 2

    def test_missing_dir(self, tmp_path: Path):
        s = summarize(tmp_path / "nope")
        assert s["trace_count"] == 0
        assert s["stages"] == {}
