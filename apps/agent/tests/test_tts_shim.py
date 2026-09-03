"""Pure-helper tests for scripts/pocket-tts-shim.py (no live server).

Imports the script via importlib path loading; skipped gracefully if the
script file is missing.
"""

import importlib.util
from pathlib import Path

import pytest

_SHIM = Path(__file__).resolve().parents[3] / "scripts" / "pocket-tts-shim.py"

pytestmark = pytest.mark.skipif(not _SHIM.is_file(), reason="pocket-tts-shim.py not found")


def _load():
    spec = importlib.util.spec_from_file_location("pocket_tts_shim", _SHIM)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def shim():
    return _load()


def _wav(pcm: bytes = b"\x01\x02\x03\x04", extra_chunk: bool = False) -> bytes:
    import struct

    fmt = struct.pack("<HHIIHH", 1, 1, 24000, 48000, 2, 16)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt
    if extra_chunk:
        junk = b"LIST"
        chunks += b"LIST" + struct.pack("<I", len(junk)) + junk
    return b"RIFF" + struct.pack("<I", 4 + len(chunks) + 8 + len(pcm)) + b"WAVE" + chunks + b"data" + struct.pack("<I", len(pcm)) + pcm


class TestMapVoice:
    def test_none_defaults(self, shim):
        assert shim.map_voice(None) == ("alba", None)
        assert shim.map_voice("") == ("alba", None)

    def test_kokoro_ids(self, shim):
        assert shim.map_voice("af_heart") == ("alba", None)
        assert shim.map_voice("jf_alpha") == ("alba", None)
        assert shim.map_voice("ef_dora") == ("alba", None)

    def test_unknown_kokoro_prefix_falls_back(self, shim):
        assert shim.map_voice("xx_yyy") == ("alba", None)

    def test_plain_name_passthrough(self, shim):
        assert shim.map_voice("alba") == ("alba", None)

    def test_wav_path_for_cloning(self, shim, tmp_path):
        p = tmp_path / "clone.wav"
        p.write_bytes(b"RIFF")
        assert shim.map_voice(str(p)) == ("", str(p))


class TestWavToPcm:
    def test_strips_header(self, shim):
        pcm = b"\x01\x02\x03\x04"
        assert shim.wav_to_pcm(_wav(pcm)) == pcm

    def test_handles_extra_chunks(self, shim):
        pcm = b"\xaa\xbb"
        assert shim.wav_to_pcm(_wav(pcm, extra_chunk=True)) == pcm

    def test_rejects_non_wav(self, shim):
        with pytest.raises(ValueError, match="RIFF"):
            shim.wav_to_pcm(b"not a wav at all")

    def test_rejects_non_pcm_format(self, shim):
        import struct

        data = _wav()
        # patch format tag 1 -> 6 (a-law)
        idx = data.index(b"fmt ") + 8
        patched = bytearray(data)
        struct.pack_into("<H", patched, idx, 6)
        with pytest.raises(ValueError, match="format tag"):
            shim.wav_to_pcm(bytes(patched))


class TestLanguageDefaultVoice:
    def test_language_picks_default(self, shim):
        assert shim.map_voice(None, "fr") == ("estelle", None)
        assert shim.map_voice("", "de") == ("juergen", None)
        assert shim.map_voice(None, "pt") == ("rafael", None)
        assert shim.map_voice(None, "es") == ("lola", None)
        assert shim.map_voice(None, "it") == ("giovanni", None)

    def test_explicit_voice_wins(self, shim):
        assert shim.map_voice("mariam", "fr") == ("mariam", None)

    def test_unknown_language_falls_back(self, shim):
        assert shim.map_voice(None, "zz") == ("alba", None)

    def test_no_language_backward_compatible(self, shim):
        assert shim.map_voice(None, None) == ("alba", None)
        assert shim.map_voice(None) == ("alba", None)
