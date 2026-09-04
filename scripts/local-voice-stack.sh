#!/usr/bin/env bash
# Local voice stack for di app testing. Idempotent: safe to re-run.
#
#   LLM : Bifrost gateway (http://localhost:8317/v1), key from macOS keychain
#   STT : parakeet-server (~/bin/parakeet-server, Metal) on :9003
#   TTS : pocket-tts serve on :9004 + OpenAI-compat shim on :9005
#   SFU : livekit-server --dev on :7880
#
# The shim adapts kyutai pocket-tts's multipart /tts (returns WAV) to the
# OpenAI POST /v1/audio/speech shape the worker's PocketTts adapter calls.
# Wire the worker with scripts/dev-env.sh (source it before starting di).
set -euo pipefail

MODELS_DIR="$HOME/.cache/parakeet.cpp/models"
PARAKEET_MODEL="$MODELS_DIR/tdt_ctc-110m-q4_k.gguf"
SHIM_PORT=9005

# parakeet STT :9003
if ! lsof -nP -iTCP:9003 -sTCP:LISTEN >/dev/null 2>&1; then
  [ -f "$PARAKEET_MODEL" ] || { echo "missing $PARAKEET_MODEL (see ~/.cache/parakeet.cpp/models)"; exit 1; }
  nohup "$HOME/bin/parakeet-server" --model "$PARAKEET_MODEL" --port 9003 \
    > /tmp/parakeet.log 2>&1 & disown
  echo "parakeet-server starting on :9003 (first request loads the model)"
else
  echo "parakeet-server already on :9003"
fi

# pocket-tts :9004 + shim :9005
if ! lsof -nP -iTCP:9004 -sTCP:LISTEN >/dev/null 2>&1; then
  nohup pocket-tts serve --port 9004 > /tmp/pocket-tts.log 2>&1 & disown
  echo "pocket-tts serve starting on :9004"
else
  echo "pocket-tts already on :9004"
fi

if ! lsof -nP -iTCP:$SHIM_PORT -sTCP:LISTEN >/dev/null 2>&1; then
  SHIM_PORT=$SHIM_PORT nohup bun "$(dirname "$0")/pocket-shim.ts" \
    > /tmp/pocket-shim.log 2>&1 & disown
  echo "pocket shim starting on :$SHIM_PORT"
else
  echo "pocket shim already on :$SHIM_PORT"
fi

# livekit SFU :7880
if ! lsof -nP -iTCP:7880 -sTCP:LISTEN >/dev/null 2>&1; then
  nohup livekit-server --dev > /tmp/livekit.log 2>&1 & disown
  echo "livekit-server --dev starting on :7880"
else
  echo "livekit-server already on :7880"
fi

echo "done. now:  source scripts/dev-env.sh && DI_TEST_MODE=1 bun run server/src/cli.ts --config config.example.yaml"
