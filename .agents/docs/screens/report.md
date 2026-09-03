# Screen: Report (`/report/[id]`)

## ASCII mockup (current state)

```
+------------------------------------------------------------------+
|  [logo]        INTERVIEW REPORT   session {id}                   |
+------------------------------------------------------------------+
|  +----------------+  +----------------+  +----------------+      |
|  | SCORE BENTO    |  | overall  7.4   |  | verdict badge  |      |
|  +----------------+  +----------------+  +----------------+      |
|  +----------------------------------------------+                |
|  | COMPETENCY CHART (radar / bars per skill)    |                |
|  +----------------------------------------------+                |
|  +--------------------------+  +--------------------------+      |
|  | LANGUAGE REPORT CARD     |  | STRENGTHS & GAPS         |      |
|  | (per-language breakdown) |  | + strengths  - gaps      |      |
|  +--------------------------+  +--------------------------+      |
|  +----------------------------------------------+                |
|  | MODEL ANSWERS (ideal responses per question) |                |
|  +----------------------------------------------+                |
|  +----------------------------------------------+                |
|  | TRANSCRIPT SECTION (full interview log)      |                |
|  +----------------------------------------------+                |
|  +------------------------------------------------------------+ |
|  |        +-----------------------------+                     | |
|  |        |  Coach me ->                |  => /prep?session=  | |
|  |        +-----------------------------+                     | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

While scoring is pending, a ScoringPoll section polls until results arrive.

## Section inventory

- ScoreBento (overall score tiles).
- CompetencyChart.
- LanguageReportCard.
- StrengthsGaps.
- ModelAnswers.
- TranscriptSection.
- ScoringPoll (pending-state poller).
- Coach CTA band.

## Primary CTAs

- **Coach me** -> `/prep?session={id}`.

## States

- `scoring` - ScoringPoll active; skeletons shown.
- `ready` - full report rendered.
- `failed` - scoring failed; retry message.
- `notFound` - invalid session id.

## Nav links

- Header nav; Coach me -> `/prep?session={id}`.

## Key files

- `apps/web/app/report/[id]/page.tsx` - route
- `apps/web/components/report/*` - score-bento, competency-chart,
  language-report-card, strengths-gaps, model-answers, transcript-section,
  scoring-poll
