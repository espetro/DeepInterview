# AGENTS.md

Orientation for coding agents working in this repo. di is a local-first AI mock interview agent: configure an interview, optional validate step, voice interview over WebSocket, transcript and report, history.

## Architecture

Bun monorepo; within each module, domain logic depends on injected port interfaces (see `.agents/docs/adr/0002-websocket-voice.md`). Two runtimes: the Hono server (Bun) and the SPA (browser). Valibot contracts in `shared/` are the anti-corruption layer between them; request/response shapes are never hand-rolled in `server/` or `web/`.

## Layout

- `shared/` - `@di/shared` package. Valibot contracts only: `config.ts` (config schema + `DI_` env override rules), `session.ts` (session/turn/report/tool-state/event schemas), `plan.ts`, `report.ts`, `voice.ts` (WebSocket voice message envelope, discriminated union on `t`). Any API change starts here.
- `server/` - Hono API on Bun, storage in bun:sqlite via Kysely. `src/cli.ts` is the entry (`--config`, `--check`). `src/api/routes.ts` defines `/v1/*`; `src/api/test-mode.ts` mounts `/v1/test/*` when `DI_TEST_MODE=1`. Serves the built SPA from `web/dist/client` if present. Generates `/v1/openapi.json` in `src/api/app.ts`.
- `server/src/voice/` - the voice pipeline, in-process: WS handler (`ws.ts`), per-connection `VoiceLoop` (`loop.ts`), and adapter implementations (`stt/whisper-stt.ts`, `tts/pocket-tts.ts`, `llm.ts`) all speaking OpenAI-compatible HTTP. `VoiceLoop` takes injected STT/TTS/LLM ports; tests stub them.
- `web/` - TanStack Start SPA, routes in `src/routes/`: `/`, `/setup`, `/validate/$id`, `/interview/$id`, `/finish/$id`, `/report/$id`, `/history`. Voice client in `src/lib/voice/`: `SpeechDriver` interface with a WebSocket server-driver (default) and a Web Speech API browser-driver (static-build fallback), an xstate v5 turn FSM, Web Audio capture (16k PCM16) with client-side Silero VAD, and `PcmPlayer` playback. Build output is `web/dist/client` (note: `client`, not `dist` root).
- `evals/` - vitest eval suite plus `mock-provider/main.ts`, an OpenAI-compatible mock server (chat, transcription, speech, models endpoints, `--port` flag).
- `tests/e2e/` - Playwright spec `playwright.spec.ts` executing scenarios from `specs/*.md`. Requires a running test-mode server; target from `DI_URL` (default `http://localhost:3000`).
- `.agents/docs/screens/*.md` - screen specs (ASCII mockup + behavior + URL/state per route). Update the screen spec in the same commit as any route behavior change.

## Commands

Bun workspaces. `mise` tasks (see `mise.toml`):

- `mise run dev` - web dev server (vite) in `web/`
- `mise run build` - web SPA build
- `mise run test` - vitest across shared, server, web, evals
- `mise run check` - tests + `tsc --noEmit` in web
- `mise run evals` - evals suite
- `mise run e2e` - Playwright; precondition: test-mode server running, `DI_URL` to override target
- `mise run logs` - tail `.di/logs/*.log` with pino pretty printing via jq
- `mise run smoke` - behavioral smoke probe against `$DI_URL` (default `http://localhost:3000`); endpoint exists only in test mode

Server runbook for local work:

```sh
bun run evals/mock-provider/main.ts --port 9000 &         # mock provider, no keys
DI_TEST_MODE=1 bun run server/src/cli.ts --config config.yaml
bun run server/src/cli.ts --config config.yaml --check    # validate config + probe providers
```

Full-stack app test with real voice (no cloud STT/TTS): `scripts/local-voice-stack.sh` starts parakeet STT (:9003), pocket-tts (:9004) behind an OpenAI-compatible shim (:9005). Then `source scripts/dev-env.sh` (Bifrost LLM via keychain key, never on disk) and start the server. See `scripts/pocket-shim.ts` for why the shim exists.

## Conventions

- Contracts live in `shared/` as valibot schemas. Server routes validate with `@hono/valibot-validator`; never hand-roll request shapes in `server/` or `web/`.
- Web state: nanostores atoms for local/UI state, TanStack Router file routes with `$id` params; forms validated against `@di/shared` schemas (formisch). See `.agents/docs/screens/*.md` for the per-route contract.
- Commits: conventional commits, atomic, no co-author trailers.
- Package manager: bun only. Never `npm`/`npx`. `packageManager` is `bun@*` in root `package.json`. Toolchain versions via `mise` (`mise.toml`: bun, node 24).
- Formatting: lowercase-technical docs style, no em dashes.

## Test mode driving recipe

The fastest way to exercise the whole app without a browser:

1. Start mock provider on 9000 and the server with `DI_TEST_MODE=1` (commands above). Test mode mounts `/v1/test/*`.
2. `curl -s $DI_URL/v1/test/ping` must return `{"testMode":true}`; if it 404s, test mode is off.
3. `POST /v1/sessions` with `{title, mode, duration_min}` (duration 5..120, mode `interview|coach`). Response is 201 with a uuid `id`.
4. Voice over WS: open `GET /v1/sessions/:id/voice` as a WebSocket, send binary frames (4-byte big-endian seq + PCM16LE mono 16k), then `{t:"utterance_end"}`; expect `user_transcript` → `agent_transcript` → `agent_speaking on` → `tts` chunks (binary framing + b64 JSON) → `agent_speaking off`. Control messages: `{t:"mute",muted}`, `{t:"interrupt"}` (b64 `{t:"audio",seq,pcm}` frames accepted as fallback). Contracts: `shared/src/voice.ts`.
5. Text turns: `POST /v1/sessions/:id/turns` with `{id: uuid, seq, speaker: user|agent, text, created_at: ISO, source: voice|text}`.
6. Assert via `GET /v1/test/state` (sessions + reports) and `GET /v1/test/events?session_id=...` (voice loop lifecycle + agent turns) or `GET /v1/test/pipeline/:id` (ordered STT/LLM/TTS stage view).
7. Round-trip checks: `PUT`/`GET /v1/sessions/:id/tools` (editor + whiteboard strings the voice loop's read tools read) and `PUT`/`GET /v1/sessions/:id/report`.

Readable scenario source of truth is `tests/e2e/specs/*.md`; `playwright.spec.ts` must stay in sync with those headings (there is a spec enforcing it). API surface: `GET /v1/openapi.json` (WS messages are not in openapi.json; see `shared/src/voice.ts`).

## Gotchas

- Web build output is `web/dist/client`. The server serves it only if that directory exists; a missing build means a bare API on `server.port`. `mise run build` builds the web SPA.
- `mise run e2e` does not start a server. Start one in test mode first, or point `DI_URL` at it.
- Config env overrides use `DI_` + `__` separator (`DI_LLM__MODEL`), and digit-only values are coerced to numbers. Nested keys are lowercase after the prefix.
- Voice: transport is streaming WS frames, but recognition is utterance-buffered (client VAD delimits; parakeet has no streaming endpoint). TTS responses are WAV; the server decodes and resamples to 24k PCM16 regardless of provider sample rate.
- Voice driver selection in the web app: `VITE_VOICE_DEFAULT` env wins, else probe `/api/health` (reachable → server driver, unreachable → browser Web Speech driver, Chromium-only best effort).
- VAD assets (silero onnx + onnxruntime wasm) are vendored in `web/public/vad/` and must stay committed for offline/local-first use.
- Report payloads: `overall_score` and competency scores are 0..10 (not 0..100); `competencies[].evidence[].verdict` is `worked|improve|drop`. See `shared/src/report.ts`.
- Screen behavior changes must update the matching `.agents/docs/screens/*.md` in the same commit.
