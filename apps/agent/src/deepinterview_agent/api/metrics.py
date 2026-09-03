"""Metrics aggregation over the local JSONL trace store + a tiny viewer UI.

``summarize`` is a pure function: it scans the newest ``last_n`` trace files
(mtime-sorted, bounded like ``core.tracing.list_traces``), streams each JSONL
line once, and aggregates in memory — no DB, no deps beyond the stdlib. The
API exposes it at ``GET /api/metrics/summary`` and a self-contained dark
debug page at ``GET /metrics``.

Notes on the event schema (see ``core.tracing``):
- ``span_end`` / ``trace_end`` carry ``duration_ms`` + ``status``.
- ``llm_call`` carries ``latency_ms``, ``ok``, ``provider``/``model``,
  ``prompt_chars`` and ``method``. There are **no token counts** in the
  current schema, so token metrics are omitted.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from ..core.config import get_settings

router = APIRouter()


def percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile on a pre-sorted-agnostic list (no numpy)."""
    if not values:
        return 0.0
    s = sorted(values)
    rank = max(1, math.ceil(pct / 100 * len(s)))
    return s[min(len(s) - 1, rank - 1)]


def summarize(
    trace_dir: str | Path, session_id: str | None = None, last_n: int = 50
) -> dict[str, Any]:
    """Aggregate recent trace files into per-stage percentiles + LLM stats.

    Bounded scan: newest ``last_n`` files by mtime, one streaming pass each.
    """
    d = Path(trace_dir)
    if not d.exists():
        return {
            "trace_count": 0,
            "error_rate": 0.0,
            "wall_clock_ms": {"p50": 0.0, "p95": 0.0, "max": 0.0},
            "stages": {},
            "llm": {"calls": 0, "errors": 0, "p50_ms": 0.0, "p95_ms": 0.0, "prompt_chars": 0},
            "note": "no token counts in trace schema",
        }
    try:
        files = sorted(d.glob("tr_*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        files = []

    stage_durs: dict[str, list[float]] = {}
    stage_total = stage_err = 0

    def absorb(f_stage: dict[str, list[float]], f_total: int, f_err: int) -> None:
        nonlocal stage_total, stage_err
        for name, vals in f_stage.items():
            stage_durs.setdefault(name, []).extend(vals)
        stage_total += f_total
        stage_err += f_err
    llm_lat: list[float] = []
    llm_calls = llm_err = llm_chars = 0
    trace_count = trace_err = 0
    wall: list[float] = []

    for path in files[: max(1, last_n)]:
        trace_sid: str | None = None
        trace_status = "running"
        trace_dur: float | None = None
        trace_error = False
        span_names: dict[str, str] = {}
        f_stage: dict[str, list[float]] = {}
        f_total = f_err = 0
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        ev = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    t = ev.get("type")
                    if t == "trace_start":
                        trace_sid = ev.get("session_id")
                    elif t == "trace_end":
                        trace_status = ev.get("status", "ok")
                        trace_dur = ev.get("duration_ms")
                        if trace_status == "error" or ev.get("error"):
                            trace_error = True
                    elif t == "span_start":
                        span_names[ev.get("span_id", "")] = ev.get("name", "?")
                    elif t == "span_end":
                        name = ev.get("name") or span_names.get(ev.get("span_id", ""), "?")
                        dur = ev.get("duration_ms")
                        f_total += 1
                        if dur is not None:
                            f_stage.setdefault(name, []).append(float(dur))
                        if ev.get("status") == "error" or ev.get("error"):
                            f_err += 1
                    elif t == "llm_call":
                        llm_calls += 1
                        llm_chars += int(ev.get("prompt_chars") or 0)
                        if not ev.get("ok", True):
                            llm_err += 1
                        if ev.get("latency_ms") is not None:
                            llm_lat.append(float(ev["latency_ms"]))
        except OSError:
            continue
        if session_id and trace_sid != session_id:
            continue
        absorb(f_stage, f_total, f_err)
        trace_count += 1
        if trace_error:
            trace_err += 1
        if trace_dur is not None:
            wall.append(float(trace_dur))

    def bucket(vals: list[float]) -> dict[str, float]:
        return {
            "p50": round(percentile(vals, 50), 1),
            "p95": round(percentile(vals, 95), 1),
            "max": round(max(vals), 1) if vals else 0.0,
        }

    total_spans = stage_total
    return {
        "trace_count": trace_count,
        "error_rate": round(trace_err / trace_count, 3) if trace_count else 0.0,
        "span_count": total_spans,
        "span_error_count": stage_err,
        "wall_clock_ms": bucket(wall),
        "stages": {name: {"count": len(v), **bucket(v)} for name, v in sorted(stage_durs.items())},
        "llm": {
            "calls": llm_calls,
            "errors": llm_err,
            "prompt_chars": llm_chars,
            "p50_ms": round(percentile(llm_lat, 50), 1),
            "p95_ms": round(percentile(llm_lat, 95), 1),
        },
        "note": "no token counts in trace schema (llm_call records prompt_chars only)",
    }


_SUMMARY_JS = r"""
fetch('/api/metrics/summary').then(r=>r.json()).then(s=>{
  document.getElementById('summary').textContent =
    `traces ${s.trace_count}  error_rate ${s.error_rate}  wall p50/p95/max ` +
    `${s.wall_clock_ms.p50}/${s.wall_clock_ms.p95}/${s.wall_clock_ms.max} ms  ` +
    `llm ${s.llm.calls} calls (${s.llm.errors} err) p95 ${s.llm.p95_ms} ms  ` +
    `span errors ${s.span_error_count}/${s.span_count}`;
  const rows = Object.entries(s.stages).map(([n,v]) =>
    `<tr><td>${n}</td><td>${v.count}</td><td>${v.p50}</td><td>${v.p95}</td>` +
    `<td>${v.max}</td></tr>`).join('');
  document.getElementById('stages').innerHTML = rows;
});
fetch('/api/traces?limit=20').then(r=>r.json()).then(d=>{
  document.getElementById('traces').innerHTML = d.traces.map(t =>
    `<tr><td>${t.started_at||''}</td><td>${t.name}</td><td>${t.session_id||''}</td>` +
    `<td>${t.duration_ms??''}</td><td class="${t.errors?'err':''}">${t.errors}</td>` +
    `<td><a href="/api/traces/${t.trace_id}">${t.trace_id}</a></td></tr>`).join('');
});
"""

_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>agent metrics</title>
<style>
 body{background:#111;color:#ccc;font:13px/1.5 ui-monospace,Menlo,monospace;
      margin:2rem;max-width:70rem}
 h2{color:#9cf;font-size:13px;text-transform:uppercase;margin:1.5rem 0 .5rem}
 table{border-collapse:collapse;width:100%}
 td,th{border:1px solid #333;padding:2px 8px;text-align:left}
 th{color:#888}
 .err{color:#f66}
 a{color:#6cf}
 #summary{color:#7c7}
</style></head><body>
<h1>agent metrics</h1><pre id="summary">loading…</pre>
<h2>stage latencies (ms)</h2>
<table><thead><tr><th>stage</th><th>count</th><th>p50</th><th>p95</th><th>max</th></tr></thead>
<tbody id="stages"></tbody></table>
<h2>recent traces</h2>
<table><thead><tr><th>started</th><th>name</th><th>session</th><th>ms</th><th>errs</th>
<th>trace</th></tr></thead><tbody id="traces"></tbody></table>
<script>__JS__</script></body></html>
"""


@router.get("/api/metrics/summary")
async def metrics_summary(
    session_id: str | None = Query(default=None),
    last_n: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    return summarize(get_settings().trace_dir, session_id=session_id, last_n=last_n)


@router.get("/metrics", response_class=HTMLResponse)
async def metrics_ui() -> HTMLResponse:
    return HTMLResponse(_HTML.replace("__JS__", _SUMMARY_JS))
