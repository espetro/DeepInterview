# Screen: Live room (`/interview/[id]`)

## ASCII mockup (current state)

```
+------------------------------------------------------------------+
|  LIVE ROOM      session {id}          [ session-timer 12:34 ]    |
+------------------------------------------------------------------+
|  +--------------------------+  +------------------------------+  |
|  | VOICE STAGE              |  | WHITEBOARD PANEL             |  |
|  |  [ avatar-stage ]        |  |  (agent-drawn notes /        |  |
|  |   o                      |  |   question sketches)         |  |
|  |  /|\  speaking pulse     |  |                              |  |
|  |  / \                     |  |                              |  |
|  +--------------------------+  +------------------------------+  |
|  +----------------------------------------------+                |
|  | TRANSCRIPT PANEL                             |                |
|  |  interviewer: Tell me about ...              |                |
|  |  you: Well, ...                              |                |
|  +----------------------------------------------+                |
|  +------------------------------------------------------------+ |
|  | CONTROL BAR  [mic o] [cam o] [text fallback] [leave]       | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
|  (ended state: "Interview complete" -> Continue to report)       |
+------------------------------------------------------------------+
```

## Section inventory

- Header: session id + SessionTimer.
- VoiceStage wrapping AvatarStage (animated interviewer avatar).
- TranscriptPanel: rolling turn-by-turn transcript.
- WhiteboardPanel: agent-shared visual notes.
- TextFallback: text input when voice unavailable.
- ControlBar: mic / camera toggles, text-fallback toggle, leave.
- LiveKit room underneath (token minted server-side).

## Primary CTAs

- **Leave / finish** -> routes to `/report/{id}`.
- Text fallback send.

## States

- `connecting` - joining LiveKit room.
- `connected` - room active.
- `preview` - device preview before joining.
- `ended` - room closed; link to report.
- `notFound` - session id invalid/missing.

Server component verifies the session exists before rendering, then mints a
LiveKit token with metadata `{session_id, duration_min}`.

## Nav links

- Leave -> `/report/{id}`.

## Key files

- `apps/web/app/interview/[id]/page.tsx` - server component, session check, token mint
- `apps/web/components/interview/live-room.tsx`
- `apps/web/components/interview/voice-stage.tsx`
- `apps/web/components/interview/avatar-stage.tsx`
- `apps/web/components/interview/control-bar.tsx`
- `apps/web/components/interview/transcript-panel.tsx`
- `apps/web/components/interview/whiteboard-panel.tsx`
- `apps/web/components/interview/text-fallback.tsx`
- `apps/web/components/interview/session-timer.tsx`
