#!/usr/bin/env python3
"""OpenAI-compatible TTS shim in front of `pocket-tts serve` (Kyutai).

DeepInterview's agent worker (apps/agent/src/deepinterview_agent/worker.py)
builds its local TTS with the LiveKit `openai` plugin pointed at
KOKORO_BASE_URL and POSTs OpenAI-style JSON to `{base_url}/audio/speech`
(model/voice/response_format=pcm 24kHz). `pocket-tts serve` only exposes a
multipart POST /tts returning a 24kHz mono 16-bit WAV. This single-file shim
translates between the two, so the worker code stays untouched.

Run standalone (no repo dependency changes):

    uv run --with fastapi --with httpx --with uvicorn python scripts/pocket-tts-shim.py

Pair it with the real TTS server (separate terminal):

    pocket-tts serve --host 127.0.0.1 --port 8880 --quantize

Then set KOKORO_BASE_URL=http://127.0.0.1:8890 in .env.

Config via env:
    HOST=127.0.0.1  PORT=8890  UPSTREAM=http://127.0.0.1:8880/tts

Notes:
- Not streaming: the LiveKit plugin buffers pcm responses fine, so we return
  the whole body at once.
- `voice` may be a kokoro-style id (af_heart -> built-in "alba", see
  VOICE_MAP), a plain pocket-tts built-in name (passed through), or a path to
  a .wav file, which enables voice cloning via the voice_wav multipart field.
"""

from __future__ import annotations

import os
import struct
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8890"))
UPSTREAM = os.environ.get("UPSTREAM", "http://127.0.0.1:8880/tts")

# Kokoro voice-id prefix -> pocket-tts built-in voice. pocket-tts ships a
# handful of built-ins, all English; non-English kokoro ids fall back to alba.
# NOTE: the per-language default voice table in
# apps/agent/config/ui.toml ([voices.<lang>]) is the source of truth for the
# agent; this standalone script duplicates its entries so it keeps working with
# zero repo dependencies. Keep the two in sync when adding voices/languages.
VOICE_MAP = {
    "af_": "alba",
    "am_": "alba",
    "bf_": "alba",
    "bm_": "alba",
    "jf_": "alba",
    "jm_": "alba",
    "zf_": "alba",
    "zm_": "alba",
    "ef_": "alba",
    "em_": "alba",
    "ff_": "alba",
    "hf_": "alba",
    "hm_": "alba",
    "if_": "alba",
    "im_": "alba",
    "pf_": "alba",
    "pm_": "alba",
}
DEFAULT_VOICE = "alba"

# Per-language default voices, mirroring [voices.<lang>].default in
# apps/agent/config/ui.toml (duplicated intentionally: this script is
# standalone). Used only when the request carries a `language` but no `voice`.
LANGUAGE_DEFAULT_VOICE = {
    "en": "alba",
    "fr": "estelle",
    "de": "juergen",
    "pt": "rafael",
    "es": "lola",
    "it": "giovanni",
}

MODELS_PAYLOAD = {
    "object": "list",
    "data": [
        {
            "id": "tts-1",
            "object": "model",
            "created": 0,
            "owned_by": "pocket-tts-shim",
        }
    ],
}

app = FastAPI(title="pocket-tts OpenAI shim")


def map_voice(
    voice: str | None, language: str | None = None
) -> tuple[str, str | None]:
    """Return (voice_url, voice_wav_path) for an OpenAI voice field.

    - None/empty -> per-language default when a recognized `language` is given,
      otherwise the global default built-in.
    - Path to an existing .wav -> ("", path) for voice cloning.
    - kokoro-style id (xx_name) -> prefix lookup in VOICE_MAP.
    - Anything else -> passed through as a pocket-tts built-in name.
    """
    if not voice:
        if language:
            return LANGUAGE_DEFAULT_VOICE.get(language.lower(), DEFAULT_VOICE), None
        return DEFAULT_VOICE, None
    if voice.lower().endswith(".wav") and Path(voice).is_file():
        return "", voice
    if len(voice) >= 3 and voice[2] == "_":
        return VOICE_MAP.get(voice[:3], DEFAULT_VOICE), None
    return voice, None


def wav_to_pcm(data: bytes) -> bytes:
    """Extract raw PCM payload from a WAV file, validating it is PCM16.

    Walks the RIFF chunk list (handling extra chunks like LIST/fact) until the
    `data` chunk. Raises ValueError if not a canonical 16-bit PCM WAV.
    """
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("not a RIFF/WAVE file")
    fmt = None
    pos = 12
    while pos + 8 <= len(data):
        cid = data[pos : pos + 4]
        (size,) = struct.unpack("<I", data[pos + 4 : pos + 8])
        body = data[pos + 8 : pos + 8 + size]
        if cid == b"fmt ":
            fmt = struct.unpack("<HHIIHH", body[:16])
        elif cid == b"data":
            if fmt is None:
                raise ValueError("data chunk before fmt chunk")
            audio_format, channels, rate, _byte_rate, _align, bits = fmt
            if audio_format != 1:
                raise ValueError(f"unsupported WAV format tag {audio_format}, want PCM (1)")
            if bits != 16:
                raise ValueError(f"unsupported bit depth {bits}, want 16-bit PCM")
            return body
        pos += 8 + size + (size & 1)  # chunks are word-aligned
    raise ValueError("no data chunk found")


@app.get("/models")
@app.get("/v1/models")
async def models() -> JSONResponse:
    return JSONResponse(MODELS_PAYLOAD)


@app.post("/audio/speech")
@app.post("/v1/audio/speech")
async def speech(payload: dict) -> Response:
    text = (payload.get("input") or "").strip()
    if not text:
        raise HTTPException(400, "input is required")
    response_format = payload.get("response_format") or "pcm"
    if response_format not in ("pcm", "wav"):
        raise HTTPException(400, f"unsupported response_format {response_format!r}; use pcm or wav")
    voice_url, voice_wav = map_voice(payload.get("voice"), payload.get("language"))

    fields = {"text": text, "voice_url": voice_url}
    files = None
    if voice_wav:
        wav_bytes = Path(voice_wav).read_bytes()
        files = {"voice_wav": (Path(voice_wav).name, wav_bytes, "audio/wav")}
        fields.pop("voice_url")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(UPSTREAM, data=fields, files=files)
    resp.raise_for_status()

    if response_format == "wav":
        return Response(content=resp.content, media_type="audio/wav")
    try:
        pcm = wav_to_pcm(resp.content)
    except ValueError as exc:
        raise HTTPException(502, f"upstream returned bad WAV: {exc}") from exc
    return Response(content=pcm, media_type="audio/pcm")


@app.get("/health")
async def health() -> Response:
    url = UPSTREAM.rsplit("/", 1)[0] + "/health"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
    return Response(content=resp.content, media_type="application/json", status_code=resp.status_code)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
