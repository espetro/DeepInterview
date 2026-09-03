# User flows

## Main flow (landing -> setup -> prep poll -> interview -> report -> prep coach)

```mermaid
flowchart LR
    L[/: landing] -->|Start| S[/setup]
    S -->|POST /api/prep| P[/session/{id} poll]
    P -->|ready| I[/interview/{id} live room]
    I -->|ended| R[/report/{id}]
    R -->|Coach me| C[/prep?session={id}]
    C -->|Socratic CTA| S
```

Steps:

1. Landing `/`: user clicks Start -> `/setup`.
2. Setup `/setup`: user uploads CV/paste, picks difficulty, voice, language,
   duration, passes device check, hits Start. Client calls `startSession`
   server action which POSTs to `/api/prep`, then navigates to
   `/session/{id}` (persona passed as query param in the current build).
3. Session poll `/session/{id}`: `PrepSummary` polls
   `GET /api/session/{id}` every `POLL_MS` until status is a ready state.
4. Live room `/interview/{id}`: server verifies session, mints LiveKit token
   with metadata `{session_id, duration_min}`; voice interview runs.
5. Report `/report/{id}`: ScoringPoll waits for scores, then renders the
   full report.
6. Prep coach `/prep?session={id}`: grounded coaching on the weak spots.

## Fast flow (NEW: setup -> ready immediately)

```mermaid
flowchart LR
    S[/setup] -->|"POST /api/prep?fast=true (facts file + difficulty + voice + duration)"| P[/session/{id}]
    P -->|status ready immediately, pass-through| I[/interview/{id}]
```

Steps:

1. Setup posts the facts file plus difficulty, voice, and duration to
   `POST /api/prep?fast=true`.
2. The session is created and becomes `ready` immediately; no long-running
   prep wait.
3. `/session/{id}` renders the poll screen but passes through instantly
   (ready on first poll); the user proceeds straight to Start interview.
4. Heavy prep/grounding continues asynchronously; the interview and report
   read whatever context is available.

## Error / recovery paths

```mermaid
flowchart LR
    P[/session/{id} poll] -->|rejected| X[/setup retry]
    P -->|error| X
    P -->|stalled| X
    P -->|ready| I[/interview/{id}]
```

Statuses surfaced by `GET /api/session/{id}` via PrepSummary:

- `rejected`: uploaded material failed validation (bad file type, empty
  facts, unreadable doc). Show reason; link back to `/setup` to re-upload.
- `error`: agent crashed during prep. Show error banner; back to `/setup`
  to retry. Session id is dead; a new session must be created.
- `stalled`: polling exceeded the timeout with no status change. Prompt the
  user to retry; optionally keep polling once more on user action.
- `ready-no-context`: prep finished but extracted no usable context.
  Proceed to interview with a warning; report may be thin.

## Coach loop (report -> prep -> back to setup)

```mermaid
flowchart LR
    R[/report/{id}] -->|"Coach me"| C[/prep?session={id}]
    C -->|"Socratic CTA (quiz me instead)"| S[/setup]
    S -->|new session| P[/session/{id}] --> R
```

Steps:

1. Report `/report/{id}` shows gaps; user clicks "Coach me" ->
   `/prep?session={id}`.
2. Prep coach loads grounded context from that session (study plan,
   flashcards, chat focused on the gaps).
3. Socratic CTA invites the user to test the new knowledge with a fresh mock
   interview -> `/setup` -> new session -> report. Loop repeats.
