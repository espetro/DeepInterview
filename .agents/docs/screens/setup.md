# Screen: Setup (`/setup`)

## ASCII mockup (iteration 2 state)

```
+------------------------------------------------------------------+
|  [logo]                                 Prep      Avatars        |
+------------------------------------------------------------------+
|  Set up your interview                                           |
|                                                                  |
|  (1) FACTS                                                       |
|  +------------------------------------------------------------+ |
|  |  Drop your CV / resume  (.pdf .docx .md .txt)              | |
|  |  [ drag & drop zone ]        or  [ choose file ]           | |
|  |  --------------------------------------------------------  | |
|  |  Paste text (optional; wins over the file on collision)    | |
|  |  +------------------------------------------------------+ | |
|  |  | (textarea)                                           | | |
|  |  +------------------------------------------------------+ | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  (1b) JOB DETAILS (small fields, kept for PrepRequest)           |
|  +------------------------------------------------------------+ |
|  |  Job description  [________________]                       | |
|  |  Company          [________________]                       | |
|                                                                  |
|  (2) DIFFICULTY                                                  |
|  +------------------------------------------------------------+ |
|  |  ( easy )  [ medium ]  ( hard )        <- segmented select  | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  (3) VOICE & LANGUAGE & DURATION                                 |
|  +------------------------------------------------------------+ |
|  |  Voice   [ dropdown v ]   (from apps/agent/config/ui.toml)  | |
|  |  Language ( en ) ( vi ) ( es ) ( zh ) ( fr ) ( de ) ( ja )  | |
|  |  Duration [ 30 ] min   clamp 5-60                           | |
|  |  presets: (20) (30) (45) (60)                               | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  (4) DEVICE + START                                              |
|  +------------------------------------------------------------+ |
|  |  DeviceCheck: mic [ok]  speaker [ok]  [ re-test ]           | |
|  |                    +------------------------+               | |
|  |                    |  Start interview  ->   |               | |
|  |                    +------------------------+               | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

## Section inventory (current, iteration 2)

1. **Facts**: file upload (`.pdf` / `.docx` / `.md` / `.txt`, drag-drop, base64
   data URL) + optional paste textarea. If both are provided, the pasted text
   wins. Plus small JD + company fields (still required strings in the
   `PrepRequest` schema).
2. **Difficulty**: easy / medium / hard selector, default medium. No persona
   picker (the live room renders the default persona).
3. **Voice / language / duration**: voice dropdown + language chips, config
   driven from `GET /api/config/ui` (backed by `apps/agent/config/ui.toml`);
   duration input in minutes, clamped 5-60, default 30, preset buttons
   20 / 30 / 45 / 60.
4. **Device check + Start**: DeviceCheck (mic/speaker), then Start.

## Primary CTAs

- **Start interview** -> POST `startSession` server action ->
  `POST /api/prep?fast=true` (difficulty / voice / duration_min included) ->
  navigate `/session/{id}` (no persona query param).

## States

- Idle / validating file (type + size checks).
- Uploading (base64 data URL built client-side).
- Submitting (server action in flight; Start disabled).
- Device check failed (Start gated until mic granted).
- Error banner (submit failure).

## Nav links

- Header: `/prep`, `/avatars`. On success: `/session/{id}`.

## Key files

- `apps/web/app/setup/page.tsx` - route
- `apps/web/components/setup/setup-form.tsx` - form, upload, chips, duration
- `apps/web/components/setup/device-check.tsx` - mic/speaker check
- `apps/web/app/setup/actions.ts` - `startSession` server action -> `/api/prep`
- `apps/web/app/api/config/ui/route.ts` - Next proxy to the agent
  `GET /api/config/ui`
- `apps/web/lib/setup-config.ts` - config fetch + fallback, duration clamp
- `apps/agent/config/ui.toml` - languages / voices / difficulties config
