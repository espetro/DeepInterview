"""Tiny dependency-graph executor built on ``graphlib.TopologicalSorter``.

Replaces LangGraph for the prep pipeline (stdlib only). Model mirrors
LangGraph's super-step execution: nodes whose predecessors have all completed
run CONCURRENTLY within a wave (``asyncio.gather``), their returned update
dicts are merged into the shared state once the whole wave finishes, then the
next wave is computed. A node's callable is ``async def node(state) -> dict``
returning only the keys it wants merged.
"""

from __future__ import annotations

import asyncio
from graphlib import CycleError, TopologicalSorter
from typing import Any, Awaitable, Callable

NodeFn = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


class Graph:
    """Static DAG of named nodes; validates topology eagerly at build time."""

    def __init__(self) -> None:
        self.nodes: dict[str, NodeFn] = {}
        self.edges: dict[str, set[str]] = {}  # node -> its prerequisites

    def add_node(self, name: str, fn: NodeFn) -> "Graph":
        self.nodes[name] = fn
        self.edges.setdefault(name, set())
        return self

    def add_edge(self, src: str, dst: str) -> "Graph":
        """Declare ``src`` must complete before ``dst`` runs."""
        self.edges.setdefault(dst, set()).add(src)
        return self

    def build(self) -> "Runner":
        sorter = TopologicalSorter(self.edges)
        try:
            sorter.prepare()
        except CycleError as exc:
            raise ValueError(f"prep graph has a cycle: {exc}") from exc
        return Runner(self)


class Runner:
    """Compiled graph: executes waves of ready nodes concurrently."""

    def __init__(self, graph: Graph) -> None:
        self._graph = graph

    async def ainvoke(self, state: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run every node exactly once; return the fully merged state."""
        merged: dict[str, Any] = dict(state or {})
        sorter = TopologicalSorter(self._graph.edges)
        sorter.prepare()
        while sorter.is_active():
            ready = list(sorter.get_ready())
            updates = await asyncio.gather(
                *(self._graph.nodes[name](merged) for name in ready)
            )
            # Wave barrier: merge only after ALL nodes in this wave finished
            # (LangGraph super-step semantics; join nodes see every update).
            for update in updates:
                merged.update(update)
            sorter.done(*ready)
        return merged
