# Screen: Settings dialog (account dropdown, centered)

Centered glass dialog opened from the account dropdown (B3). Two panes:
History and Settings, switched by a left sidebar nav.

## ASCII mockup

```
                 +------------------------------------------+
                 | History  |  +--------------------------+ |
                 | Settings |  | backend    reported  2d  | |
                 |          |  | frontend  interviewing   | |
                 |          |  | ...                      | |
                 |          |  | (empty: history.empty)   | |
                 +------------------------------------------+
```

## Behavior

- Desktop: max-w-2xl flex-row glass panel (backdrop blur, rounded-2xl, p-0).
  Left nav (w-44): History + Settings buttons, active row bg-muted.
  Right pane: bg-card rounded panel, overflow-y.
- Mobile: full-screen override (inset-0 h-svh w-screen, no rounding, close
  button hidden) via useIsMobile media-query hook.
- History pane: client-only load from OPFS via listClientSessions in useEffect
  (SSR renders "..." then rows or the history.empty empty state). Rows link to
  /interview/$id, /finish/$id or /report/$id by status, mirroring the history
  route's target() logic, with a status chip and relative date
  (history.today/yesterday/daysAgo/weeksAgo keys).
- Settings pane: placeholder card for B4 (AI provider configuration).
