"""Offline tests for the file-driven UI config (config/ui.toml) and the
``GET /api/config/ui`` endpoint. Each test points the loader at a fixture TOML
in tmp_path (or monkeypatches the cache) so nothing depends on CWD and no test
pollutes the process-wide lru_cache."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from deepinterview_agent.app import create_app
from deepinterview_agent.core import ui_config
from deepinterview_agent.core.ui_config import UIConfigError, get_ui_config

FIXTURE = """\
[languages]
offered = ["en", "fr", "de"]
stt_supported = ["en"]

[voices.en]
default = "alba"
[[voices.en.options]]
id = "alba"
label = "Alba"
[[voices.en.options]]
id = "mariam"
label = "Mariam"

[voices.fr]
default = "estelle"
[[voices.fr.options]]
id = "estelle"
label = "Estelle"

[difficulties]
levels = ["easy", "medium", "hard"]
clamps = { easy = 2, medium = 3, hard = 4 }
"""


@pytest.fixture
def ui_toml(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    p = tmp_path / "ui.toml"
    p.write_text(FIXTURE)
    monkeypatch.setenv("UI_CONFIG_PATH", str(p))
    ui_config._cached.cache_clear()
    yield p
    ui_config._cached.cache_clear()


def _load(path: Path) -> ui_config.UIConfig:
    return ui_config._load_from(path)


class TestLoader:
    def test_loads_fixture(self, ui_toml: Path) -> None:
        cfg = _load(ui_toml)
        assert cfg.languages == ["en", "fr", "de"]
        assert cfg.stt_supported == ["en"]
        assert cfg.difficulties == ["easy", "medium", "hard"]
        assert cfg.clamps == {"easy": 2, "medium": 3, "hard": 4}

    def test_voices_parsed(self, ui_toml: Path) -> None:
        cfg = _load(ui_toml)
        assert cfg.voices["en"].default == "alba"
        assert [o.id for o in cfg.voices["en"].options] == ["alba", "mariam"]
        assert cfg.voices["fr"].default == "estelle"

    def test_missing_file_raises(self, tmp_path: Path) -> None:
        with pytest.raises(UIConfigError, match="not found"):
            _load(tmp_path / "nope.toml")

    def test_env_override(self, ui_toml: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        cfg = get_ui_config()  # env UI_CONFIG_PATH set by the fixture
        assert cfg.languages == ["en", "fr", "de"]

    def test_clamp_for(self, ui_toml: Path) -> None:
        cfg = _load(ui_toml)
        assert cfg.clamp_for("easy") == 2
        assert cfg.clamp_for("medium") == 3
        assert cfg.clamp_for("hard") == 4
        assert cfg.clamp_for(None) == 5
        assert cfg.clamp_for("mystery") == 5


class TestEndpoint:
    def test_config_ui_payload(self, ui_toml: Path) -> None:
        client = TestClient(create_app())
        resp = client.get("/api/config/ui")
        assert resp.status_code == 200
        body = resp.json()
        assert body["languages"] == ["en", "fr", "de"]
        assert body["difficulties"] == ["easy", "medium", "hard"]
        assert body["voices"]["en"] == {
            "default": "alba",
            "options": [{"id": "alba", "label": "Alba"}, {"id": "mariam", "label": "Mariam"}],
        }
        assert body["voices"]["fr"]["default"] == "estelle"

    def test_shipped_repo_config_is_valid(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The repo's own apps/agent/config/ui.toml loads and feeds the endpoint."""
        shipped = Path(__file__).resolve().parents[1] / "config" / "ui.toml"
        assert shipped.is_file()
        monkeypatch.setenv("UI_CONFIG_PATH", str(shipped))
        ui_config._cached.cache_clear()
        try:
            client = TestClient(create_app())
            body = client.get("/api/config/ui").json()
            assert "en" in body["languages"]
            assert body["voices"]["en"]["default"] == "alba"
            assert set(body["difficulties"]) == {"easy", "medium", "hard"}
        finally:
            ui_config._cached.cache_clear()


class TestSttLanguageGate:
    def test_unsupported_language_400(self, ui_toml: Path) -> None:
        client = TestClient(create_app())
        resp = client.post(
            "/api/prep",
            json={
                "cv_url": "https://example.com/cv.pdf",
                "jd_text": "Senior backend engineer building payment systems in Python.",
                "company": "Acme",
                "language_mode": {"primary": "fr", "mixed": False},
            },
        )
        assert resp.status_code == 400
        assert "STT" in resp.json()["detail"]
        assert "en" in resp.json()["detail"]

    def test_supported_language_passes_gate(self, ui_toml: Path) -> None:
        client = TestClient(create_app())
        resp = client.post(
            "/api/prep",
            json={
                "cv_url": "https://example.com/cv.pdf",
                "jd_text": "Senior backend engineer building payment systems in Python.",
                "company": "Acme",
                "language_mode": {"primary": "en", "mixed": False},
            },
        )
        assert resp.status_code == 200
