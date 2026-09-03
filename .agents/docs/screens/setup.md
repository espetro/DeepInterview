# Screen: Setup (`/setup`)

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
- File drop: text-only parsing deferred (M3 RAG); v1 stores the files against the session. Label the caps in the UI (10 files / 20MB).
- Form fields: duration (20/30/45/60), tone, difficulty, language (interview language, NOT the UI locale), mode (`interview|coach`).
- Primary action **validate & start** creates the session (POST /v1/sessions) then routes to `/validate/[id]`.
- Link **proceed without validation** routes straight to `/interview/[id]`.
- Coach mode button is disabled but animated, with an explanatory tooltip ("available after your first report") until a report exists.

## URL / state

- No URL params on entry. On submit, the created session id drives the next route.
- Form state is local + valibot schema (`CreateSessionRequest` from `@di/shared` via formisch).
