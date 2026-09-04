# cors-probe spike

Standalone page that probes, from a real browser origin, whether Groq, OpenAI, and Anthropic accept direct `fetch()` calls (CORS preflight + actual request) with a user-supplied test key. Phase 1.2 of the client-side distribution plan.

## Run

Any static file server works (the page must be served over http(s), not opened via `file://`, so it has a real origin):

```sh
bun x serve spikes/cors-probe        # http://localhost:3000
# or
bunx vite --open spikes/cors-probe/cors-check.html
```

Paste a test key per provider (or seed via `?k_groq=…&k_openai=…&k_anthropic=…` for dev convenience — never share/commit such URLs), hit **Run probe**.

What it reports per provider:

- **Preflight**: explicit `OPTIONS` with the same auth headers — whether it is answered and with which status.
- **Actual call**: a minimal 1-token chat POST. A readable `401/403` still proves CORS works (browser only exposes the status if the preflight/ACAO allowed it).
- **CORS headers observed**: every `access-control-*` header on the response.

Keys exist only in the page's memory and as request headers to the provider. The page is fully static; nothing is sent anywhere else.

## Files

- `cors-check.html` — probe page (self-contained, no build step).
- `probe.test.ts` — sanity test: the inline script parses and provider configs are well-formed.
- `FINDINGS.md` — documented CORS posture per provider + observed results + STT/TTS tier memo.
