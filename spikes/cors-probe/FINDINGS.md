# CORS probe findings (Phase 1.2) + STT/TTS tier memo (Phase 1.5)

Spike page: `cors-check.html` (see `README.md` for how to run). Phase 1.2 of
`.agents/plans/2026-09-04-distribution-client-side.md`.

## Documented CORS posture per provider

| Provider      | Direct browser fetch              | Notes                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Groq**      | ✅ Allowed                        | No opt-in header needed. Community/3rd-party API directories consistently report CORS enabled on `api.groq.com`; browser `fetch()` with `Authorization: Bearer` is the documented pattern for client-side apps. Watch: same rate limits as server calls; don't send `credentials: 'include'`. |
| **OpenAI**    | ✅ Allowed                        | API sends permissive `access-control-allow-*`; official TS SDK ships `dangerouslyAllowBrowser` flag (key exposure is the concern, not CORS). Direct browser calls go through when the user accepts the key-exposure tradeoff (which BYOK local-first apps do by design).                      |
| **Anthropic** | ✅ Allowed **with opt-in header** | Requires `anthropic-dangerous-direct-browser-access: true` on the request (in addition to `x-api-key` + `anthropic-version`); without it the preflight is rejected. Introduced Aug 2024 (Simon Willison's writeup). Our probe sends this header.                                              |

All three keys travel as request headers from the browser — acceptable for di's
BYOK model (keys live client-side, user-supplied, never on our servers).

## Observed results (hands-on)

**Pending.** No Groq/Anthropic test keys were available in this environment at
spike time (`OPENAI_API_KEY` exists in the shell but was not used to avoid
spending/moving a personal key into browser memory). The harness is complete and
takes <1 min to run when a key is at hand:

```sh
bun x serve spikes/cors-probe
# open http://localhost:3000, paste key(s), Run probe
```

Expected per documented behavior above: Groq and OpenAI green; Anthropic green
only because the probe sends the `anthropic-dangerous-direct-browser-access`
header (dropping that header and re-running is itself a useful negative test).

## STT/TTS tier model (Phase 1.5 decision memo)

Settings UI should expose three voice tiers, in this order:

1. **Free cloud preset — Groq (zero-setup default).**
   Groq hosts both whisper-large-v3 STT and (via OpenAI-compatible endpoints)
   TTS/LLM, has CORS open (per above), and a generous free tier. This becomes
   the default preset: user pastes one Groq key, everything works. Keys stored
   client-side only (BYOK), matching Phase 2.

2. **Browser-native — Web Speech API (no-key fallback).**
   `SpeechRecognition` (STT) and `speechSynthesis` (TTS) ship with the browser;
   zero keys, zero network to LLM providers for voice. Quality/consistency is
   worse (WebKit's `SpeechRecognition` availability is the same WebKit question
   tracked in Phase 1.3) but it guarantees an always-works floor. The
   `spikes/sw-api/` spike validates the exact API surface.

3. **DIY self-host — custom `base_url` tier.**
   parakeet (STT) / pocket-tts via `scripts/local-voice-stack.sh`
   (process-compose shim, requires the parakeet model in
   `~/.cache/parakeet.cpp/models/`). Important architectural note: these are
   _server processes_. Under Option C (client-side only, static bundle, no
   sidecar) di cannot launch or supervise them — the user must start the stack
   themselves and point di at `http://localhost:<port>` as a custom
   `base_url`. Hence this stays a **DIY tier only**, never a default. If the
   ElectroBun wrapper (Phase 3) later gains process supervision, this tier
   could be promoted to managed — out of scope for now.

Tier order in the settings UI: Groq preset → browser-native fallback → DIY
base_url (advanced, collapsed).

## Implication for Option C gate

Nothing in the documented posture blocks direct browser calls for any of the
three chat providers. The Anthropic opt-in header is a code-level detail, not
an architecture risk. Hands-on confirmation with real keys remains the only
open item; the probe harness exists for it.
