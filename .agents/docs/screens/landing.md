# Screen: Landing (`/`)

## ASCII mockup (current state)

```
+------------------------------------------------------------------+
|  [logo deep-interview]            Avatars   Prep   |   (no auth) |
+------------------------------------------------------------------+
|                                                                  |
|                        ~ ~ ~ ~ ~ ~ ~ ~                           |
|                   AI MOCK INTERVIEWS                             |
|                Practice like it's the real thing.                |
|             Grounded prep, live voice rooms, scored reports.     |
|                                                                  |
|                  +-----------------------------+                 |
|                  |        Start  ->            |   (=> /setup)   |
|                  +-----------------------------+                 |
|                                                                  |
|     [ hero visual / illustration region ]                        |
|                                                                  |
+------------------------------------------------------------------+
|  HOW IT WORKS                                                    |
|  +--------------+  +--------------+  +--------------+            |
|  | 1. Upload CV |  | 2. Live room |  | 3. Report    |            |
|  | + JD facts   |  | voice agent  |  | scores + gap |            |
|  +--------------+  +--------------+  +--------------+            |
+------------------------------------------------------------------+
|  CTA BAND                                                        |
|      Ready to practice?      [ Start an interview -> /setup ]    |
+------------------------------------------------------------------+
|  footer: (c) deep-interview                                      |
+------------------------------------------------------------------+
```

## Section inventory

- Top nav: logo + links (Avatars `/avatars`, Prep `/prep`).
- Hero: headline, subcopy, primary CTA.
- How-it-works: 3-step explainer band.
- CTA band: secondary conversion block with Start button.
- Footer.

## Primary CTAs

- Hero **Start** -> `/setup`
- CTA band **Start an interview** -> `/setup`

## States

- Static marketing page; no data-dependent states.

## Nav links

- `/setup` (CTAs), `/avatars`, `/prep`.

## Key files

- `apps/web/app/page.tsx` - route
- `apps/web/components/landing/*` - hero, steps, CTA band
