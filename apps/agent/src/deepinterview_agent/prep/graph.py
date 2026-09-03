"""Prep pipeline graph built on the stdlib executor (LangGraph removed).

Topology (fan-out then join then sequential keystone)::

    START ─┬─> fetch_cv ─> cv_analysis ─┐
           ├─> jd_analysis ─────────────┼─> gap_matching ─> question_planner ─> END
           └─> company_research ────────┘

``jd_analysis`` and ``company_research`` run concurrently with ``fetch_cv``
(executor waves); ``gap_matching`` waits for all three branches before running —
``gap_matching`` reads ``candidate`` + ``job``, while ``company`` finishes
independently and is consumed by ``question_planner`` along with the gap
analysis.

Deps are bound into each node with :func:`functools.partial` so the compiled
node presents the ``(state)`` signature the executor invokes.
"""

from __future__ import annotations

from functools import partial
from typing import TYPE_CHECKING

from . import nodes
from .executor import Graph
from .state import PrepState

if TYPE_CHECKING:
    from ..core.deps import Deps


def build_prep_graph(deps: Deps) -> Graph:
    """Build the prep DAG with ``deps`` bound into nodes."""
    graph = Graph()
    graph.add_node("fetch_cv", partial(nodes.fetch_cv, deps=deps))
    graph.add_node("cv_analysis", partial(nodes.cv_analysis, deps=deps))
    graph.add_node("jd_analysis", partial(nodes.jd_analysis, deps=deps))
    graph.add_node("company_research", partial(nodes.company_research, deps=deps))
    graph.add_node("gap_matching", partial(nodes.gap_matching, deps=deps))
    graph.add_node("question_planner", partial(nodes.question_planner, deps=deps))

    graph.add_edge("fetch_cv", "cv_analysis")
    # Roots (no prerequisites): fetch_cv, jd_analysis, company_research.
    graph.add_edge("cv_analysis", "gap_matching")
    graph.add_edge("jd_analysis", "gap_matching")
    graph.add_edge("company_research", "gap_matching")
    graph.add_edge("gap_matching", "question_planner")
    return graph.build()
