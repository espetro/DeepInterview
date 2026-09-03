# Stack runbook (native, non-Docker)

## Services and ports

| Service | Port | Notes |
| --- | --- | --- |
| web (Next.js) | 3000 | `apps/web` |
| agent API (FastAPI/uv) | 8000 | `apps/agent` |
| LiveKit | 7880 | voice room server |
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
  and difficulties**. The setup screen reads its voice dropdown, language
  chips (en/vi/es/zh/fr/de/ja), and difficulty options from here. When you
  add a language or voice, update this file, and update
  `.agents/docs/screens/setup.md` in the same commit.

## Start order

1. Infra services (LiveKit :7880, lightrag :9621, whisper/speaches :8001,
   kokoro :8890, Ollama :11434) - start these first; the agent and web
   depend on them.
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
