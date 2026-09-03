# Screen: Setup (`/setup`)

## ASCII mockup (POST-iteration-2 TARGET state)

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
|  |  Paste text (optional)                                     | |
|  |  +------------------------------------------------------+ | |
|  |  | (textarea)                                           | | |
|  |  +------------------------------------------------------+ | |
|  +------------------------------------------------------------+ |
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

Note: this mockup is the **target state**. The current implementation still
carries demo sample loaders and a 4-persona picker (query-param only); those
are removed by iteration 2. Update this file whenever the screen changes and
remove this note once the target ships.

## Section inventory (target)

1. **Facts**: file upload (`.pdf` / `.docx` / `.md` / `.txt`, drag-drop, base64
   data URL) + optional paste textarea. Replaces CV upload + JD/company fields.
2. **Difficulty**: easy / medium / hard selector. No persona picker.
3. **Voice / language / duration**: voice dropdown + language chips
   (en, vi, es, zh, fr, de, ja), config-driven from
   `apps/agent/config/ui.toml`; duration input in minutes, clamped 5-60,
   with preset buttons 20 / 30 / 45 / 60.
4. **Device check + Start**: DeviceCheck (mic/speaker), then Start.

## Primary CTAs

- **Start interview** -> POST `startSession` server action -> `/api/prep` ->
  navigate `/session/{id}`.

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
- `apps/agent/config/ui.toml` - languages / voices / difficulties config
