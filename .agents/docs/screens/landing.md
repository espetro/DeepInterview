# Screen: Landing (`/`, `/{-$locale}`) — Variant B "playful notebook"

The landing lives under the optional `{-$locale}` route segment: `/` is the en
landing, `/es`, `/fr`, ... are locale landings. All in-app routes share the
same optional prefix (`/setup`, `/es/setup`, ...). Locale switching swaps the
prefix via real links, so prerender crawl discovers every locale page.

## ASCII mockup

```
+------------------------------------------------------------------+
|  [logo di]                                    history   github   |
+------------------------------------------------------------------+
|                                                                  |
|   ~ practice like you mean it ~                                  |
|                                                                  |
|   THE AI AGENT            +----------------+                     |
|   YOU PRACTICE            :  [sticker 1]   :                     |
|   YOUR INTERVIEWS WITH.   :  "tell me     :   +---------------+  |
|   (chunky rounded         :   about a time:   :  [sticker 2]   :  |
|   display type, tilted)   :   you failed." :   :  system design :  |
|                           +----------------+   :  45 min, hard  :  |
|        +-------------------+                   +---------------+  |
|        |  [sticker 3]      |      +---------------------------------+
|        |  behavioral q's   |      |  [sticker 4] why did you     |
|        |  quick fire       |      |  [sticker 5] leave your job? |
|        +-------------------+      +---------------------------------+
|                                                                  |
|              +-----------------------------+                     |
|              |        grill me ->          |   (=> /setup)       |
|              +-----------------------------+                     |
|                                                                  |
|        voice interviews with an AI that actually pushes back.    |
+------------------------------------------------------------------+
```

## Behavior

- Shared AppHeader (from `__root`): logo, GitHub icon link, placeholder account button.
- CTA **"grill me ->"** navigates to `/setup` (locale-prefixed).
- Locale switcher in the header area: real links to `/`, `/es`, ... so crawlLinks prerenders all locale pages.
- 5 tilted sticker/post-it cards with real interview-question content, placed at edges; decorative rotation, no interactivity.
- Trust micro-line under CTA: single sentence, no stats (v1).

## Notes

- Warm cream bg + orange accents (Variant B tokens from `theme.css`).
- Screen state is fully static; no URL params, no store reads.
