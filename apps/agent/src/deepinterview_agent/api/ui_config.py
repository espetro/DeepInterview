"""``GET /api/config/ui`` — the file-driven interview options for the UI.

Languages, voices, and difficulty levels come from ``apps/agent/config/ui.toml``
(see :mod:`..core.ui_config`); nothing here is hardcoded. Read-only and
unguarded, following the same posture as the session GET / traces routers.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..core.ui_config import get_ui_config

router = APIRouter()


@router.get("/api/config/ui")
async def get_ui_options() -> dict:
    cfg = get_ui_config()
    return {
        "languages": list(cfg.languages),
        "voices": {
            lang: {
                "default": vs.default,
                "options": [{"id": o.id, "label": o.label} for o in vs.options],
            }
            for lang, vs in cfg.voices.items()
        },
        "difficulties": list(cfg.difficulties),
    }
