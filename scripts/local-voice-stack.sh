#!/usr/bin/env bash
# di local stack via process-compose - one owner for every process.
#   TUI:   process-compose up        (repo root, uses .di/process-compose.yaml)
#   headless: process-compose --config .di/process-compose.yaml -t=false
# Logs: .di/logs/{parakeet,pocket-tts,pocket-shim,di}.log
# Requires parakeet model in ~/.cache/parakeet.cpp/models/ and Bifrost key in
# the macOS keychain (scripts/dev-env.sh pulls it at source time).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f "$HOME/.cache/parakeet.cpp/models/tdt_ctc-110m-q4_k.gguf" ] || {
  echo "missing parakeet model in ~/.cache/parakeet.cpp/models/"; exit 1; }
mkdir -p .di/logs

# Preflight: report (and with --reap, kill by exact pid) stray processes from
# a previous stack that survived past their supervisor's death. Never a broad
# pkill against a pattern — that has killed the mise shell itself before;
# every kill here targets one pid pgrep already resolved.
reap=0
args=()
for arg in "$@"; do
  if [ "$arg" = "--reap" ]; then
    reap=1
  else
    args+=("$arg")
  fi
done

stray_patterns=(
  "worker\.js"
  "livekit-server --dev"
  "pocket-tts serve"
  "parakeet-server"
)
strays=()
for pattern in "${stray_patterns[@]}"; do
  while IFS= read -r pid; do
    [ -n "$pid" ] && strays+=("$pid:$pattern")
  done < <(pgrep -f "$pattern" || true)
done

if [ "${#strays[@]}" -gt 0 ]; then
  echo "stray processes from a previous stack:"
  for entry in "${strays[@]}"; do
    pid="${entry%%:*}"
    pattern="${entry#*:}"
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || echo "<gone>")"
    echo "  pid $pid ($pattern): $cmd"
  done
  if [ "$reap" -eq 1 ]; then
    for entry in "${strays[@]}"; do
      pid="${entry%%:*}"
      echo "reaping pid $pid"
      kill -9 "$pid" 2>/dev/null || true
    done
  else
    echo "re-run with --reap to kill these by pid"
  fi
fi

exec process-compose --config .di/process-compose.yaml "${args[@]}"
