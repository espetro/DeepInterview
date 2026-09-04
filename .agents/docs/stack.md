# Stack runbook (native, non-Docker)

## Services and ports

| Service | Port | Notes |
| --- | --- | --- |
| web (TanStack Start) | 3000 | served by the di server |
| lightrag | 9621 | RAG / grounding |
| whisper / speaches | 8001 | STT |
| kokoro | 8890 | TTS |
| Ollama | 11434 | local LLM |

## Env files

- `apps/agent/.env`
- `apps/web/.env.local`

Copy from teammates / templates if missing; never commit real values.

## Config

- `apps/agent/config/ui.toml` - UI-facing config for **languages, voices,
  and difficulties** (`[languages] offered / stt_supported`, per-language
  `[voices.<lang>]` with default + options, `[difficulties]` levels + clamps).
  The setup screen reads its voice dropdown, language chips, and difficulty
  options from here via the agent's `GET /api/config/ui` (proxied by the web
  route `apps/web/app/api/config/ui/route.ts`). The loader is
  `src/deepinterview_agent/core/ui_config.py`; set `UI_CONFIG_PATH` to
  override the file location (useful for tests and local experiments). The
  live interviewer's difficulty clamp (easy 2, medium 3, hard 4) also reads
  this file. When you add a language or voice, update this file, and update
  `.agents/docs/screens/setup.md` in the same commit.

## Start order

1. Infra services (lightrag :9621, whisper/speaches :8001,
   kokoro :8890, Ollama :11434) - start these first; the app
   depends on them.
2. Agent API:
   ```bash
   uv --directory apps/agent sync
   # then run the agent API (serves :8000) with env from apps/agent/.env
   ```
3. Web app (turbo dev):
   ```bash
   pnpm dev
   ```

`pnpm dev` runs via turbo; web listens on :3000 and proxies agent calls to
:8000.

## Tests

Agent (pytest):

```bash
cd apps/agent && uv run pytest -q
```

Web (vitest):

```bash
cd apps/web && vitest run
```
