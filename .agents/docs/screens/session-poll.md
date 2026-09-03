# Screen: Session poll (`/session/[id]`)

## ASCII mockup (current state)

```
+------------------------------------------------------------------+
|  [logo]                                 Prep      Avatars        |
+------------------------------------------------------------------+
|  Preparing your interview                                        |
|  session: {id}                                                   |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | PREP SUMMARY (PrepSummary client poller)                   | |
|  |                                                            | |
|  |  status: [ prep | ready | ready-no-context |               | |
|  |            rejected | error | stalled ]                    | |
|  |                                                            | |
|  |  spinner "Analyzing your CV and job description..."        | |
|  |  checklist: [x] facts parsed  [ ] questions drafted        | |
|  +------------------------------------------------------------+ |
|                                                                  |
|        +-----------------------------------+                     |
|        |  Start interview ->               |  (enabled on ready) |
|        +-----------------------------------+                     |
|        => /interview/{id}                                        |
+------------------------------------------------------------------+
```

## Section inventory

- Header nav.
- PrepSummary card: status pill, progress copy, checklist of prep artifacts.
- Start interview CTA (gated on ready states).

## Primary CTAs

- **Start interview** -> `/interview/{id}` (no persona param; difficulty and
  voice ride on the LiveKit token metadata).

## States

Driven by polling `GET /api/session/{id}` every `POLL_MS`:

- `prep` - agent still analyzing; spinner, CTA disabled.
- `ready` - prep complete; CTA enabled.
- `ready-no-context` - ready but no extracted context; CTA enabled with notice.
- `rejected` - uploaded material rejected; message + link back to `/setup`.
- `error` - agent failure; message + retry/back-to-setup.
- `stalled` - no progress within timeout; suggest retry.

Fast flow (see `user-flows.md`): when setup posted `/api/prep?fast=true`,
the session is ready immediately and this screen passes through instantly.

## Nav links

- Header: `/prep`, `/avatars`. Back to `/setup` on failure.

## Key files

- `apps/web/app/session/[id]/page.tsx` - route
- `apps/web/components/session/prep-summary.tsx` - poller, state machine, CTA
