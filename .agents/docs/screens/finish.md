# Screen: Finish (`/finish/[id]`)

## ASCII mockup

```
+------------------------------------------------------------------+
|                        interview complete                        |
|                     "{session title}"                            |
|                     32 minutes · 14 turns                        |
|                                                                  |
|              +-----------------------------+                     |
|              |       get transcript        |  (download JSON)    |
|              +-----------------------------+                     |
|              +-----------------------------+                     |
|              |       generate report       |  => /report/[id]    |
|              +-----------------------------+                     |
|                                                                  |
|                        ( discard )                               |
+------------------------------------------------------------------+
```

## Behavior

- Arrives here from timer hard-stop or early end (both interview exit paths).
- **Get transcript**: downloads both sides (user + agent) as JSON (GET /v1/sessions/[id]/turns).
- **Generate report**: requests report generation (worker -> POST /v1/sessions/[id]/report), then routes to `/report/[id]`. Button shows a pending state while the report is being produced.
- **Discard**: marks session discarded (status change) and returns to `/history`.

## URL / state

- `id` path param: session id. Session summary fetched via TanStack Query.
