# di

di is a local-first AI mock interview agent. You configure an interview (preset or custom prompt, duration, files), optionally validate the plan, then run a voice interview with a LiveKit voice agent backed by OpenAI-compatible STT, TTS, and LLM providers. After the interview you get a transcript and a scored report, and everything is kept in local history. Everything runs on your machine: one Bun process serves the API and the built web SPA, a supervisor spawns the worker and LiveKit child processes, and a SQLite database holds sessions, turns, events, tool state, and reports.

For LLM agents: this repo is agent drivable end to end. With `DI_TEST_MODE=1` the server mounts `/v1/test/*` debug routes so you can create sessions, post turns, and assert state over plain HTTP instead of scraping the DOM. See [test mode](#test-mode-driving-di-as-an-agent) and [docs/setup-prompt.md](docs/setup-prompt.md).

## Quickstart

Requires [bun](https://bun.sh) and [mise](https://mise.jdx.dev).

```sh
curl -fsSL https://bun.sh/install | bash
git clone <repo-url> && cd deep-interview
bun install
mise run build            # builds web SPA into web/dist/client and the worker bundle
cp config.example.yaml config.yaml
bun run evals/mock-provider/main.ts --port 9000 &   # offline mock provider, no keys needed
bun run server/src/cli.ts --config config.yaml
# open http://localhost:3000
```

The default config uses the in-repo mock provider, so no API keys are required. Point `llm`/`stt`/`tts` at any OpenAI-compatible endpoint (OpenAI, Ollama, vLLM, ...) and set real `livekit` credentials for actual voice.

Validate config and connectivity without starting the server:

```sh
bun run server/src/cli.ts --config config.yaml --check
```

CLI flags: `--config <path>` (default `config.yaml`), `--check`, `--no-supervise` (do not spawn worker/livekit children).

## Architecture

```
shared/    valibot contracts (@di/shared): config schema, session/turn/report/tool-state schemas
server/    Hono API on Bun. bun:sqlite storage. Serves embedded web SPA from web/dist/client.
           Supervisor spawns worker + livekit children (specs in server/src/supervisor/).
           CLI entry: server/src/cli.ts
worker/    @livekit/agents voice worker. STT/TTS/LLM via OpenAI-compatible providers.
           Tools: read_editor, read_whiteboard, update_question
web/       TanStack Start SPA. Routes: / /setup /validate/$id /interview/$id /finish/$id /report/$id /history
           Build output: web/dist/client (served by the server)
evals/     vitest suite using the mock OpenAI provider (evals/mock-provider)
tests/e2e  Playwright specs (tests/e2e/playwright.spec.ts) executing scenarios in tests/e2e/specs/*.md
```

Flow: web SPA and agents talk to the server on `server.port` under `/v1/*`. The server supervisor spawns the worker and LiveKit as children, passing provider config through env. The worker pulls session context and pushes session events back to the server. All request/response shapes are valibot schemas in `shared/`.

## Config reference

Config file is YAML, validated by `ConfigSchema` in `shared/src/config.ts`. Any key can be overridden by env: `DI_` prefix, `__` as nesting separator, digits coerced to numbers. Example: `DI_LLM__MODEL=gpt-4o` overrides `llm.model`; `DI_SERVER__PORT=9000` overrides `server.port`. A value in env always wins over the yaml file. Case-insensitive key paths after the prefix.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `server.port` | int 1..65535 | required | HTTP port for the API and SPA |
| `server.auth` | `none` \| `token` | `none` | auth middleware stub, inert in v1 |
| `llm.provider` | `openai` \| `anthropic` \| `mock` | required | LLM contract; endpoints are all OpenAI-shaped |
| `llm.base_url` | url | required | OpenAI-compatible base URL, e.g. `http://localhost:9000/v1` |
| `llm.api_key` | string | optional | bearer key for the LLM endpoint |
| `llm.model` | string | required | model id |
| `stt.base_url` | url | required | speech-to-text endpoint (OpenAI transcription shape) |
| `stt.api_key` | string | optional | bearer key |
| `stt.model` | string | required | STT model id |
| `stt.mode` | `buffered` | required | v1 is buffered-only; streaming is an M2+ caveat |
| `tts.base_url` | url | required | text-to-speech endpoint |
| `tts.api_key` | string | optional | bearer key |
| `tts.model` | string | required | TTS model id |
| `tts.voice` | string | required | voice id, e.g. `alloy` |
| `embeddings.base_url` | url | optional | embeddings endpoint |
| `embeddings.api_key` | string | optional | bearer key |
| `embeddings.model` | string | required if embeddings block present | embeddings model id |
| `livekit.url` | url | required | LiveKit server, e.g. `ws://localhost:7880` |
| `livekit.api_key` | string | required | LiveKit API key |
| `livekit.api_secret` | string | required | LiveKit API secret |
| `phoenix.endpoint` | url | optional | Arize Phoenix tracing endpoint |
| `phoenix.headers` | map | optional | headers for the Phoenix endpoint |
| `files.db_path` | string | required | SQLite database path |
| `files.log_path` | string | required | log file path |
| `files.data_dir` | string | required | data directory |

Standalone env vars:

| Var | Effect |
| --- | --- |
| `DI_TEST_MODE=1` | mounts `/v1/test/*` debug routes |
| `DI_URL` | target server for the e2e suite (default `http://localhost:3000`) |
| `DI_<SECTION>__<KEY>` | yaml override for any config key, see rules above |

## API

The full machine-readable surface lives at `GET /v1/openapi.json` on a running server (OpenAPI 3.1). Summary:

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/sessions` | create session (`title`, `mode: interview\|coach`, `duration_min` 5..120, optional `prompt`) |
| `GET /v1/sessions`, `GET /v1/sessions/:id` | list / read sessions |
| `POST /v1/sessions/:id/turns` | append a transcript turn |
| `GET /v1/sessions/:id/turns` | read transcript |
| `POST /v1/sessions/:id/events` | worker -> server session event |
| `PUT` / `GET /v1/sessions/:id/tools` | editor + whiteboard state the worker reads via `read_editor` / `read_whiteboard` |
| `POST /v1/sessions/:id/documents` | upload files for RAG ingestion (multipart `file`, repeatable; pdf/md/txt/docx, 10 files / 20MB caps) |
| `GET /v1/sessions/:id/documents` | list uploaded documents with ingestion status |
| `DELETE /v1/sessions/:id/documents/:docId` | remove a document and its chunks |
| `GET /v1/sessions/:id/context` | retrieved document chunks grounding the agent (optional `?query=`) |
| `PUT` / `GET /v1/sessions/:id/report` | store / read the scored report |
| `POST /v1/token` | LiveKit token minting, 501 stub for now |

## Test mode: driving di as an agent

Run the stack in test mode:

```sh
bun run evals/mock-provider/main.ts --port 9000 &
DI_TEST_MODE=1 bun run server/src/cli.ts --config config.yaml
```

Then drive it entirely over HTTP:

```sh
# probe test mode
curl -s localhost:3000/v1/test/ping          # {"testMode":true}

# create a session
curl -s -X POST localhost:3000/v1/sessions \
  -H 'content-type: application/json' \
  -d '{"title":"behavioral","mode":"interview","duration_min":30}'
# 201, Location header has the session id

# post turns (id must be a uuid, created_at an ISO timestamp)
curl -s -X POST localhost:3000/v1/sessions/$SID/turns \
  -H 'content-type: application/json' \
  -d '{"id":"'"$(uuidgen | tr A-Z a-z)"'","seq":0,"speaker":"user","text":"hi","created_at":"2026-01-01T00:00:00Z","source":"text"}'

# assert on serialized server state
curl -s localhost:3000/v1/test/state         # {sessions:[...], reports:[...]}
curl -s "localhost:3000/v1/test/events?session_id=$SID"
```

Use `/v1/test/state` and `/v1/test/events` for assertions instead of DOM scraping. Readable scenarios live in `tests/e2e/specs/*.md`.

## Tests, evals, e2e

```sh
mise run test    # vitest across shared, server, worker, web, evals
mise run check   # tests + web typecheck (tsc --noEmit)
mise run evals   # evals suite with the mock OpenAI provider
mise run e2e     # Playwright; needs a test-mode server already running
DI_URL=http://localhost:8090 mise run e2e   # override target
```

## Troubleshooting

- **Port already in use**: the server binds `server.port` (default 3000), the mock provider 9000, LiveKit 7880. Override with `DI_SERVER__PORT` or edit config; kill strays with `lsof -ti :PORT | xargs kill`.
- **`di --check` fails on llm/stt/tts**: the provider endpoints are not reachable. For offline work start the mock provider first: `bun run evals/mock-provider/main.ts --port 9000` and keep `base_url: http://localhost:9000/v1`.
- **LiveKit**: real voice needs a LiveKit server matching `livekit.url`/`api_key`/`api_secret`. For local dev `livekit-server --dev` plus devkey/secret works. Without LiveKit, API-level driving in test mode still works; the voice worker will not join rooms.
- **Blank UI**: the server serves the SPA only if `web/dist/client` exists. Run `mise run build` first, or use `mise run dev` for the web dev server.
- **Config errors name the exact key** (`config.llm.model: ...`). Bad env overrides report the effective key path too.
