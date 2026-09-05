# Screen: Setup (`/{-$locale}/setup`)

## ASCII mockup

```
+------------------------------------------------------------------+
|  [logo di]                 configure interview          history   |
+------------------------------------------------------------------+
|                                                                  |
|  PRESETS                                                         |
|  ( (sys design) (behavioral) (frontend) (ML) (custom) )          |
|                                                                  |
|  CUSTOM PROMPT                                                   |
|  +----------------------------------------------------------+   |
|  | textarea: paste a job description, your resume context,  |   |
|  | or anything the agent should know about                  |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  FILES (text-only: pdf, md, txt, docx — 10 files / 20MB max)     |
|  +----------------------------------------------------------+   |
|  |  [drop files or click to browse]                         |   |
|  +----------------------------------------------------------+   |
|  ( resume.pdf 24kB x ) ( jd.md 2kB x )                           |
|                                                                  |
|  FORM                                                            |
|  duration: (20) (30) (45) (60) min                               |
|  tone:     [dropdown]     difficulty: [dropdown]                 |
|  language: [dropdown]     mode:  (interview) (coach*)            |
|                                                                  |
|              +-----------------------------+                     |
|              |      validate & start       |  => /validate/[id]  |
|              +-----------------------------+                     |
|              proceed without validation => /interview/[id]       |
|                                                                  |
+------------------------------------------------------------------+
```

## Behavior

- Preset scenario chips fill the custom-prompt textarea with canned content; selecting a preset is just a textarea pre-fill.
- File drop: functional since M3. Files upload to `POST /v1/sessions/:id/documents`
  right after session creation (before navigating away). Text-only: pdf, md, txt,
  docx. Caps enforced client- and server-side (10 files / 20MB total) with inline
  error copy; bad-type and cap violations never navigate. Files are listed under
  the drop zone with size and a remove control. Upload failure shows an error but
  does not block starting the interview.
- Mic check: compact client-side component (`web/src/components/mic-check.tsx`)
  between files and the form. Idle by default; "test mic" requests getUserMedia,
  shows a segmented live input-level meter (persimmon, red-ish top segments) and
  a microphone device picker (populated post-permission). Switching devices
  restarts capture. Deny/no-device errors show inline copy. Nothing is recorded
  or transmitted; stop releases the stream.
- Form fields: duration (20/30/45/60), tone, difficulty, language (interview language, NOT the UI locale), mode (`interview|coach`).
- Primary action **validate & start** creates the session (POST /v1/sessions) then routes to `/validate/[id]`.
- Link **proceed without validation** routes straight to `/interview/[id]`.
- Coach mode button is disabled but animated, with an explanatory tooltip ("available after your first report") until a report exists.

- **Client-only runtime** (ADR-0003, `$effectiveRuntime === "client-only"`):
  the start action creates the session via `web/src/lib/opfs-store.ts#createClientSession`
  instead of `POST /v1/sessions`, and skips `uploadDocuments` entirely — no
  ingestion pipeline exists client-side, so files picked in this mode are
  accepted by the widget but never sent anywhere. It also calls
  `resetClientSession()` first so a new session never inherits turns/question
  state left over from a previous client-only interview in the same tab.

## URL / state

- Optional locale prefix: `/setup` (en) or `/es/setup`, ... — the prefix is the i18n source of truth.
- No URL params on entry. On submit, the created session id drives the next route.
- Form state is local + valibot schema (`CreateSessionRequest` from `@di/shared` via formisch).
