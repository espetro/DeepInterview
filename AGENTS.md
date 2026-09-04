# AGENTS.md

Orientation for coding agents working in this repo. di is a local-first AI mock interview agent: configure an interview, optional validate step, voice interview via a LiveKit worker, transcript and report, history.

## Layout

- `shared/` - `@di/shared` package. Valibot contracts only: `config.ts` (config schema + `DI_` env override rules), `session.ts` (session/turn/report/tool-state/event schemas), `plan.ts`, `report.ts`. Any API change starts here.
- `server/` - Hono API on Bun, storage in bun:sqlite via Kysely. `src/cli.ts` is the entry (`--config`, `--check`, `--no-supervise`). `src/supervisor/` spawns worker + livekit children. `src/api/routes.ts` defines `/v1/*`; `src/api/test-mode.ts` mounts `/v1/test/*` when `DI_TEST_MODE=1`. Serves the built SPA from `web/dist/client` if present. Generates `/v1/openapi.json` in `src/api/app.ts`.
- `worker/` - `@livekit/agents` voice worker. Tools: `read_editor`, `read_whiteboard`, `update_question`. STT/TTS/LLM all speak OpenAI-compatible HTTP.
- `web/` - TanStack Start SPA, routes in `src/routes/`: `/`, `/setup`, `/validate/$id`, `/interview/$id`, `/finish/$id`, `/report/$id`, `/history`. Build output is `web/dist/client` (note: `client`, not `dist` root).
- `evals/` - vitest eval suite plus `mock-provider/main.ts`, an OpenAI-compatible mock server (chat, transcription, models endpoints, `--port` flag).
- `tests/e2e/` - Playwright spec `playwright.spec.ts` executing scenarios from `specs/*.md`. Requires a running test-mode server; target from `DI_URL` (default `http://localhost:3000`).
- `.agents/docs/screens/*.md` - screen specs (ASCII mockup + behavior + URL/state per route). Update the screen spec in the same commit as any route behavior change.

## Commands

Bun workspaces. `mise` tasks (see `mise.toml`):

- `mise run dev` - web dev server (vite) in `web/`
- `mise run build` - web SPA build + worker esbuild bundle
- `mise run test` - vitest across shared, server, worker, web, evals
- `mise run check` - tests + `tsc --noEmit` in web
- `mise run evals` - evals suite
- `mise run e2e` - Playwright; precondition: test-mode server running, `DI_URL` to override target
- `mise run logs` - tail supervisor child logs (`.di/logs/{worker,sfu}.log`) with pino pretty printing via jq
- `mise run smoke` - behavioral smoke probe against `$DI_URL` (default `http://localhost:3000`); endpoint exists only in test mode

Server runbook for local work:

```sh
bun run evals/mock-provider/main.ts --port 9000 &         # mock provider, no keys
DI_TEST_MODE=1 bun run server/src/cli.ts --config config.yaml --no-supervise
bun run server/src/cli.ts --config config.yaml --check    # validate config + probe providers
```

Full-stack app test with real voice (no cloud STT/TTS): `scripts/local-voice-stack.sh` starts parakeet STT (:9003), pocket-tts (:9004) behind an OpenAI-compatible shim (:9005), and livekit (:7880). Then `source scripts/dev-env.sh` (Bifrost LLM via keychain key, never on disk) and run the server supervised. See `scripts/pocket-shim.ts` for why the shim exists.

## Conventions

- Contracts live in `shared/` as valibot schemas. Server routes validate with `@hono/valibot-validator`; never hand-roll request shapes in `server/` or `web/`.
- Web state: nanostores atoms for local/UI state, TanStack Router file routes with `$id` params; forms validated against `@di/shared` schemas (formisch). See `.agents/docs/screens/*.md` for the per-route contract.
- Commits: conventional commits, atomic, no co-author trailers.
- Package manager: bun only. Never `npm`/`npx`. `packageManager` is `bun@*` in root `package.json`. Toolchain versions via `mise` (`mise.toml`: bun, node 24).
- Formatting: lowercase-technical docs style, no em dashes.

## Test mode driving recipe

The fastest way to exercise the whole app without a browser:

1. Start mock provider on 9000 and the server with `DI_TEST_MODE=1` (commands above). Test mode mounts `/v1/test/*` and forces `DI_STT__MODE=mock` on supervised children.
2. `curl -s $DI_URL/v1/test/ping` must return `{"testMode":true}`; if it 404s, test mode is off.
3. `POST /v1/sessions` with `{title, mode, duration_min}` (duration 5..120, mode `interview|coach`). Response is 201 with a uuid `id`.
4. `POST /v1/sessions/:id/turns` with a full turn: `{id: uuid, seq, speaker: user|agent, text, created_at: ISO, source: voice|text}`.
5. Assert via `GET /v1/test/state` (sessions + reports) and `GET /v1/test/events?session_id=...` (worker lifecycle + agent turns).
6. Round-trip checks: `PUT`/`GET /v1/sessions/:id/tools` (editor + whiteboard strings the worker tools read) and `PUT`/`GET /v1/sessions/:id/report`.

Readable scenario source of truth is `tests/e2e/specs/*.md`; `playwright.spec.ts` must stay in sync with those headings (there is a spec enforcing it). API surface: `GET /v1/openapi.json`.

## Gotchas

- Web build output is `web/dist/client`. The server serves it only if that directory exists; a missing build means a bare API on `server.port`. `mise run build` builds both web and worker.
- `mise run e2e` does not start a server. Start one in test mode first, or point `DI_URL` at it.
- Config env overrides use `DI_` + `__` separator (`DI_LLM__MODEL`), and digit-only values are coerced to numbers. Nested keys are lowercase after the prefix.
- `stt.mode` only accepts `buffered` in v1; streaming is a documented M2+ caveat.
- `POST /v1/token` (LiveKit token minting) is a 501 stub.
- The supervisor only starts children without `--no-supervise`; in test mode it injects `DI_STT__MODE=mock` into child env (`server/src/supervisor/specs.ts`).
- Report payloads: `overall_score` and competency scores are 0..10 (not 0..100); `competencies[].evidence[].verdict` is `worked|improve|drop`. See `shared/src/report.ts`.
- Screen behavior changes must update the matching `.agents/docs/screens/*.md` in the same commit.
