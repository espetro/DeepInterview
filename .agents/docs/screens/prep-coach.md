# Screen: Prep coach (`/prep`)

## ASCII mockup (current state)

```
+------------------------------------------------------------------+
|  [logo]              PREP COACH        [ en | vi lang-toggle ]   |
+------------------------------------------------------------------+
|  (optional context banner: coaching session {session} )          |
|  +------------------------------------------------------------+ |
|  | STUDY PLAN                                                 | |
|  |  [x] Review JD keywords   [ ] Practice STAR stories        | |
|  +------------------------------------------------------------+ |
|  +------------------------------+  +------------------------+   |
|  | GROUNDED CHAT                |  | FLASHCARDS             |   |
|  |  > Why is React reconciliation|  |  [ card front ]        |   |
|  |    ...                       |  |  [ flip to back ]      |   |
|  |  coach: Based on your CV ... |  |                        |   |
|  |  [ input .............. (send) ]                       |   |
|  +------------------------------+  +------------------------+   |
|  +------------------------------------------------------------+ |
|  | MASTERY GRAPH (topic coverage over time)                   | |
|  |   ......*......                                            | |
|  +------------------------------------------------------------+ |
|  +------------------------------------------------------------+ |
|  |  SOCRATIC CTA: "Quiz me instead -> start a mock interview" | |
|  |                          [ Start interview -> /setup ]     | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

## Section inventory

- Header with LanguageToggle (en / vi).
- StudyPlan: checklist derived from facts / report.
- GroundedChat: RAG chat grounded in uploaded facts + lightrag context.
- Flashcards: flip cards from prep content.
- MasteryGraph: topic mastery visualization.
- SocraticCta: push from coaching back into a live interview.

## Primary CTAs

- Grounded chat send.
- **Socratic CTA / Start interview** -> `/setup`.

## States

- No session param: generic prep mode.
- `?session={id}`: coach context loaded from report (coach loop).
- Chat: idle / streaming / error banner.
- Language toggle switches copy (en / vi).

## Nav links

- `/setup` (Socratic CTA), `/report/{id}` via session context, header nav.

## Key files

- `apps/web/app/prep/page.tsx` - route
- `apps/web/components/prep/*` - study-plan, grounded-chat, flashcards,
  mastery-graph, socratic-cta, language-toggle
