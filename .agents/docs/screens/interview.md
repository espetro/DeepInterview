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
|  | EDITOR                  | WHITEBOARD             ||             |
|  | (CodeMirror w/          | (tldraw canvas —       ||             |
|  |  syntax highlighting)   |  diagrams; agent can   ||             |
|  |  def solve(nums):       |  read its contents)    ||             |
|  |                         |    ...                 || [ type      |
|  +-------------------------+-------------------------+  here...  ] |
|                                                    +-------------+|
|  [mute]  [end early]                                               |
+------------------------------------------------------------------+
```

## Behavior

- Top bar: fixed session title, countdown timer (T-2min triggers agent wrap-up; 0 hard-stops to `/finish/[id]`), agent voice orb (animated while speaking) top-right.
- **Question block**: agent-editable tool. The agent rewrites the current question + hints live (tool call). User tools (editor, whiteboard) are never rewritten by the agent, but the agent can READ them.
- **Tabbed tools**: full-width below the question block. Tabs: `Editor | Whiteboard`. Editor = CodeMirror 6 with syntax highlighting. Whiteboard = tldraw canvas for diagrams.
  - **Agent read tools**: `read_editor` (returns current editor buffer text) and `read_whiteboard` (returns serialized shape/snapshot summary). Both feed the same LLM turn path as the transcript, so the agent can reason over code and diagrams the candidate produces.
  - This is part of the test contract: unit tests for the read-tool serializers, evals asserting the agent incorporates editor/whiteboard content in its turns (mock provider scripted with tool-call fixtures), and e2e assertions via `/v1/test/events` that `read_editor` / `read_whiteboard` tool calls land in the session event log.
- **Transcript panel**: right side, translucent (10-20% alpha, iOS-26 style so background shows through), 10-20% collapsed-to-expanded width range.
  - Collapsed state = slim peek rail showing the last turn. **Minimize never fully hides it.**
  - Bottom of panel: text input box. Text input is a first-class feature (LiveKit chat/data channel -> RoomIO -> same LLM turn path as voice).
- Controls bottom: mute, end-early. Both end paths lead to `/finish/[id]`.

## URL / state

- `id` path param: session id.
- Active tool tab: search param (`?tab=editor`) — URL is the source of truth.
- LiveKit token fetched from POST `/v1/token` on mount.
