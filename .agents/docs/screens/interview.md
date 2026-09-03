# Screen: Interview (`/interview/[id]`)

## ASCII mockup

```
+------------------------------------------------------------------+
|  {session title (fixed)}        27:41            ((o)) voice orb |
+------------------------------------------------------------------+
|                                                     | T transcri.+|
|  +----------------------------------------------+  | agent: so,  |
|  |  QUESTION BLOCK (agent-editable tool)        |  | tell me...  |
|  |                                              |  |             |
|  |  Q3: "How would you handle cache             |  | user: well, |
|  |  invalidation across regions?"               |  | I'd start   |
|  |  hints:                                      |  | with...     |
|  |  - think about TTLs                          |  |             |
|  |  - consistency vs availability               |  | user: [the  |
|  |                                              |  | agent's     |
|  +----------------------------------------------+  | current     |
|                                                    | question    |
|  +-------------------------+-------------------------+ rewrites   |
|  | DASHBOARD               | EDITOR                 || this block  |
|  | (recharts panel)        | (CodeMirror w/         || live)       |
|  | [bar chart] [line]      |  syntax highlighting)  ||             |
|  | [stat cards]            |  def solve(nums):      ||             |
|  |                         |    ...                 || [ type      |
|  +-------------------------+-------------------------+  here...  ] |
|                                                    +-------------+|
|  [mute]  [end early]                                               |
+------------------------------------------------------------------+
```

## Behavior

- Top bar: fixed session title, countdown timer (T-2min triggers agent wrap-up; 0 hard-stops to `/finish/[id]`), agent voice orb (animated while speaking) top-right.
- **Question block**: agent-editable tool. The agent rewrites the current question + hints live (tool call). User tools (dashboard, editor) are never touched by the agent.
- **Tabbed tools**: full-width below the question block. Tabs: `Dashboard | Editor`. Dashboard = recharts panel (charts + stat cards fed by the candidate's own tool output). Editor = CodeMirror 6 with syntax highlighting.
- **Transcript panel**: right side, translucent (10-20% alpha, iOS-26 style so background shows through), 10-20% collapsed-to-expanded width range.
  - Collapsed state = slim peek rail showing the last turn. **Minimize never fully hides it.**
  - Bottom of panel: text input box. Text input is a first-class feature (LiveKit chat/data channel -> RoomIO -> same LLM turn path as voice).
- Controls bottom: mute, end-early. Both end paths lead to `/finish/[id]`.

## URL / state

- `id` path param: session id.
- Active tool tab: search param (`?tab=editor`) — URL is the source of truth.
- LiveKit token fetched from POST `/v1/token` on mount.
