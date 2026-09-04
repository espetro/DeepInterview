# Screen: History (`/history`)

## ASCII mockup

```
+------------------------------------------------------------------+
|  [logo di]   history                              (import) (export)|
+------------------------------------------------------------------+
|                                                                  |
|  +-----------------------------------------------------------+   |
|  | backend screen          interview   45m   reported  2d ago|   |
|  | frontend loop           interview   30m   finished 5d ago|   |
|  | system design drill     coach      20m   reported  1w ago|   |
|  +-----------------------------------------------------------+   |
|        (click row -> /report/[id] or /finish/[id])               |
|                                                                  |
+------------------------------------------------------------------+
```

## Behavior

- Session list: title, mode, duration, status, relative time. Sorted newest first.
- Row click: `reported` -> `/report/[id]`; `finished` -> `/finish/[id]`; otherwise -> `/interview/[id]` (resume) — v1 keeps it simple.
- **Export**: downloads all sessions + turns + reports as one versioned JSON file (published schema lands in M5; v1 uses the shared contract shape).
- **Import**: accepts a previously exported JSON file, validated before merge (merge by session UUID).

## URL / state

- No required params. Filters (mode, status) are typed search params when added — URL is the source of truth.
