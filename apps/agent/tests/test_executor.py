"""Tests for the stdlib prep executor (waves, join, merge, errors)."""

from __future__ import annotations

import asyncio
import time

import pytest

from deepinterview_agent.prep.executor import Graph


async def _sleep_node(state: dict, key: str, delay: float) -> dict:
    await asyncio.sleep(delay)
    return {key: True}


def test_wave_concurrency_overlaps_branches() -> None:
    """Three independent 0.2s branches must overlap, finishing < serial 0.6s."""
    g = Graph()
    for name in ("a", "b", "c"):
        g.add_node(name, lambda s, n=name: _sleep_node(s, n, 0.2))
    runner = g.build()

    start = time.monotonic()
    result = asyncio.run(runner.ainvoke({}))
    elapsed = time.monotonic() - start

    assert result == {"a": True, "b": True, "c": True}
    assert elapsed < 0.55, f"branches did not overlap: {elapsed:.2f}s"


def test_join_sees_merged_results_of_all_branches() -> None:
    """A node after three parallel branches observes every branch's key."""

    async def join(state: dict) -> dict:
        return {"joined": state["a"] and state["b"] and state["c"]}

    g = Graph()
    for name in ("a", "b", "c"):
        g.add_node(name, lambda s, n=name: _sleep_node(s, n, 0.01))
        g.add_edge(name, "join")
    g.add_node("join", join)

    result = asyncio.run(g.build().ainvoke({}))
    assert result["joined"] is True


def test_updates_merge_across_waves() -> None:
    """Later waves read keys written by earlier waves (super-step semantics)."""

    async def first(state: dict) -> dict:
        return {"x": 1}

    async def second(state: dict) -> dict:
        return {"y": state["x"] + 1}

    g = Graph()
    g.add_node("first", first).add_edge("first", "second").add_node("second", second)

    result = asyncio.run(g.build().ainvoke({"seed": 0}))
    assert result == {"seed": 0, "x": 1, "y": 2}


def test_error_propagates_and_cancels_wave() -> None:
    async def boom(state: dict) -> dict:
        raise RuntimeError("node failed")

    async def slow(state: dict) -> dict:
        await asyncio.sleep(5)
        return {"slow": True}

    g = Graph()
    g.add_node("boom", boom).add_node("slow", slow)

    start = time.monotonic()
    with pytest.raises(RuntimeError, match="node failed"):
        asyncio.run(g.build().ainvoke({}))
    assert time.monotonic() - start < 4.5, "sibling node was not cancelled"


def test_cycle_is_rejected_at_build() -> None:
    g = Graph()
    g.add_node("a", lambda s: {})
    g.add_node("b", lambda s: {})
    g.add_edge("a", "b").add_edge("b", "a")
    with pytest.raises(ValueError, match="cycle"):
        g.build()
