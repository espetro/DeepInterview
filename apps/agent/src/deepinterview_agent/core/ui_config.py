"""Loader for ``apps/agent/config/ui.toml`` — the file-driven UI options.

Languages, TTS voices, and difficulty levels/clamps are configuration, not
code: the UI-facing ``GET /api/config/ui`` endpoint, the prep route's STT
language gate, and the live interviewer's difficulty clamp all read this file
(via :func:`get_ui_config`, ``lru_cache``d like ``get_settings``). Override the
location with ``UI_CONFIG_PATH``; a missing file is a hard error — silently
defaulting would hide a mispackaged config.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .logging import get_logger

log = get_logger(__name__)

# Resolved relative to this file: <repo>/apps/agent/config/ui.toml. (Not CWD:
# the worker and API may run from different directories.)
_DEFAULT_PATH = Path(__file__).resolve().parents[3] / "config" / "ui.toml"


class UIConfigError(RuntimeError):
    """Raised when the UI config file is missing or structurally invalid."""


@dataclass(frozen=True)
class VoiceOption:
    id: str
    label: str


@dataclass(frozen=True)
class VoiceSet:
    default: str
    options: list[VoiceOption]


@dataclass(frozen=True)
class UIConfig:
    languages: list[str]
    stt_supported: list[str]
    voices: dict[str, VoiceSet]
    difficulties: list[str]
    clamps: dict[str, int]

    def clamp_for(self, difficulty: str | None) -> int:
        """Upper bound for the 1-5 question-difficulty band; unknown -> 5."""
        if difficulty is None:
            return 5
        return self.clamps.get(difficulty, 5)


def _load_from(path: Path) -> UIConfig:
    if not path.is_file():
        raise UIConfigError(
            f"UI config file not found at {path} "
            "(set UI_CONFIG_PATH or restore apps/agent/config/ui.toml)"
        )
    with path.open("rb") as fh:
        raw = tomllib.load(fh)

    languages = list(raw.get("languages", {}).get("offered", []))
    stt_supported = list(raw.get("languages", {}).get("stt_supported", []))
    if not languages:
        raise UIConfigError(f"{path}: [languages].offered must be a non-empty list")

    voices: dict[str, VoiceSet] = {}
    for lang, entry in (raw.get("voices") or {}).items():
        options = [
            VoiceOption(id=opt["id"], label=opt.get("label", opt["id"]))
            for opt in entry.get("options", [])
        ]
        default = entry.get("default") or (options[0].id if options else None)
        if not default:
            raise UIConfigError(f"{path}: [voices.{lang}] needs a default voice")
        voices[lang] = VoiceSet(default=default, options=options)

    diff = raw.get("difficulties", {})
    difficulties = list(diff.get("levels", []))
    clamps = {str(k): int(v) for k, v in (diff.get("clamps") or {}).items()}
    if not difficulties:
        raise UIConfigError(f"{path}: [difficulties].levels must be a non-empty list")

    return UIConfig(
        languages=languages,
        stt_supported=stt_supported or list(languages),
        voices=voices,
        difficulties=difficulties,
        clamps=clamps,
    )


@lru_cache(maxsize=1)
def _cached(path: str) -> UIConfig:
    cfg = _load_from(Path(path))
    log.info(
        "ui_config: loaded %d language(s), %d voice set(s), %d difficulty level(s) from %s",
        len(cfg.languages),
        len(cfg.voices),
        len(cfg.difficulties),
        path,
    )
    return cfg


def get_ui_config(path: str | os.PathLike[str] | None = None) -> UIConfig:
    """Load (and cache) the UI config. ``path`` defaults to ``UI_CONFIG_PATH``
    env, then the shipped ``apps/agent/config/ui.toml``."""
    resolved = str(path or os.environ.get("UI_CONFIG_PATH") or _DEFAULT_PATH)
    return _cached(resolved)


def default_voice_for(language: str) -> str | None:
    """Configured default pocket-tts voice for a language, or None."""
    vs = get_ui_config().voices.get(language)
    return vs.default if vs else None
