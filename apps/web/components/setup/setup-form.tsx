"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import type { LanguageMode } from "@deepinterview/shared";
import { startSession } from "@/app/setup/actions";
import { useMessages } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import {
  buildPrepRequest,
  clampDuration,
  coerceDifficulty,
  defaultVoiceId,
  fetchUiConfig,
  DURATION_PRESETS,
  DEFAULT_DIFFICULTY,
  DEFAULT_DURATION,
  type Difficulty,
  type UiConfig,
} from "@/lib/setup-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { DeviceCheck } from "@/components/setup/device-check";

// Acceptable CV uploads. The file is sent as a base64 data-URL of its RAW
// bytes and parsed server-side (pdf/docx), never via file.text().
const CV_ACCEPT =
  ".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

// Client-side minimums for PASTED facts only (we can't cheaply size a parsed
// PDF client-side). The backend is the real guard — these just block
// obviously-empty / garbage-short submits with a helpful nudge.
const MIN_FACTS_CHARS = 30;

// Max CV file size. Keeps the base64 data-URL path (base64 is ~+33%) under
// the Next server-action body limit.
const MAX_CV_BYTES = 10 * 1024 * 1024;

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const DIFFICULTY_HINTS: Record<string, string> = {
  easy: "Warm, supportive questions",
  medium: "A realistic screening",
  hard: "Senior-level pressure",
};

export function SetupForm() {
  const router = useRouter();
  const messages = useMessages();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Block 1: facts ---
  const [file, setFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState("");
  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");

  // --- Block 2: difficulty ---
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);

  // --- Block 3: voice + language + duration (from GET /api/config/ui) ---
  const [config, setConfig] = useState<UiConfig | null>(null);
  const [primary, setPrimary] = useState("en");
  const [voice, setVoice] = useState("");
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);
  const [mixed, setMixed] = useState(false);

  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factsTouched, setFactsTouched] = useState(false);

  // Load the agent's file-driven UI options once. fetchUiConfig never throws;
  // on failure it resolves the fallback config (English + "Alba").
  useEffect(() => {
    let cancelled = false;
    fetchUiConfig().then((cfg) => {
      if (cancelled) return;
      setConfig(cfg);
      setPrimary((lang) => (cfg.languages.includes(lang) ? lang : cfg.languages[0] ?? "en"));
      setVoice((v) => (cfg.voices[primary]?.options.some((o) => o.id === v) ? v : defaultVoiceId(cfg, primary)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the voice valid whenever the language changes.
  useEffect(() => {
    setVoice((v) =>
      config?.voices[primary]?.options.some((o) => o.id === v)
        ? v
        : defaultVoiceId(config ?? fallbackConfig(), primary),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, config]);

  const voiceSet = config?.voices[primary];
  const voices: { id: string; label: string }[] = voiceSet?.options ?? [
    { id: "Alba", label: "Alba" },
  ];
  const languages = config?.languages ?? ["en"];
  const difficulties = (config?.difficulties ?? ["easy", "medium", "hard"]).filter((d) =>
    ["easy", "medium", "hard"].includes(d),
  );

  // --- Client-side validation (friendly; backend is the real guard) ---
  const cvLen = cvText.trim().length;
  const factsError = !file
    ? cvLen === 0
      ? t(messages, "setup.needCv")
      : cvLen < MIN_FACTS_CHARS
        ? `Add a bit more — your CV text looks too short (at least ${MIN_FACTS_CHARS} characters).`
        : null
    : file.size > MAX_CV_BYTES
      ? `That file is too large (max ${Math.floor(MAX_CV_BYTES / (1024 * 1024))} MB). Upload a smaller CV or paste the text.`
      : null;
  const canSubmit = !factsError && !submitting;

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }, []);

  /**
   * Read a file as a base64 `data:` URL of its RAW bytes. The agent
   * base64-decodes this and parses the real document (PDF/DOCX) — unlike
   * `file.text()`, which mangles binary formats into garbage.
   */
  function fileToDataUrl(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () =>
        reject(reader.error ?? new Error("Could not read file."));
      reader.readAsDataURL(f);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (factsError) {
      setFactsTouched(true);
      return;
    }

    setSubmitting(true);

    try {
      // Body construction + CV resolution live in buildPrepRequest; the file's
      // data-URL is added here because FileReader is browser-only and async.
      // Difficulty/voice/duration ride in the body, not the URL — no persona
      // param (difficulty comes from the session context on /interview).
      const body = buildPrepRequest({
        cvText,
        // jd_text/company remain required strings in PrepRequest — kept as
        // small optional UI fields; the fast path ingests them as facts.
        jdText,
        company,
        languageMode: { primary, mixed },
        difficulty,
        voice,
        duration,
      });
      if (!body.cv_url && file) {
        body.cv_url = await fileToDataUrl(file);
      }

      // `primary` comes from the agent config (plain string). The agent's prep
      // route rejects unsupported languages (STT gate), so this cast is safe.
      const result = await startSession({
        ...body,
        language_mode: {
          ...body.language_mode,
          primary: body.language_mode.primary as LanguageMode["primary"],
        },
      });

      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      // Fast path returns quickly with a ready session — no persona param
      // (difficulty/voice ride in the session context, not the URL).
      router.push(`/session/${result.session_id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(messages, "common.error"),
      );
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <Card className="mt-8">
        <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
          <Spinner className="h-6 w-6" />
          <p className="serif text-xl text-ink">
            {t(messages, "setup.fastPreparing")}
          </p>
          {error && (
            <p className="text-[13px] text-ink-soft" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      <div>
        <h1 className="serif text-3xl text-ink">
          {t(messages, "setup.title")}
        </h1>
        <p className="mt-2 text-ink-soft">{t(messages, "setup.subtitle")}</p>
      </div>

      {/* 1. Facts: CV upload + paste, JD + company */}
      <Card>
        <CardHeader>
          <CardTitle>{t(messages, "setup.cvLabel")}</CardTitle>
          <CardDescription>{t(messages, "setup.cvHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-6">
          <div
            role="button"
            tabIndex={0}
            aria-label={t(messages, "setup.cvDrop")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed px-4 py-8 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              dragging
                ? "border-accent bg-accent-soft"
                : "border-line hover:border-ink",
            )}
          >
            {file ? (
              <span className="flex items-center gap-2 text-[14px] text-ink">
                <FileText className="h-4 w-4 text-accent" aria-hidden />
                {file.name}
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-muted hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            ) : (
              <>
                <UploadCloud className="h-5 w-5 text-muted" aria-hidden />
                <span className="text-[13px] text-muted">
                  {t(messages, "setup.cvDrop")}
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={CV_ACCEPT}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div>
            <Label htmlFor="cvText">{t(messages, "setup.cvPasteLabel")}</Label>
            <Textarea
              id="cvText"
              rows={5}
              placeholder={t(messages, "setup.cvPasteHint")}
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              onBlur={() => setFactsTouched(true)}
              aria-invalid={factsTouched && Boolean(factsError)}
            />
            {/* If both exist, pasted text is sent (see onSubmit). */}
            {file && cvText.trim() && (
              <p className="mt-1 text-[12px] text-muted">
                Pasted text will be used instead of the uploaded file.
              </p>
            )}
          </div>
          {factsTouched && factsError && (
            <p className="text-[13px] text-accent" role="alert">
              {factsError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="jdText">{t(messages, "setup.jdLabel")}</Label>
              <Textarea
                id="jdText"
                rows={4}
                className="mt-1"
                placeholder={t(messages, "setup.jdHint")}
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="company">{t(messages, "setup.companyLabel")}</Label>
              <Input
                id="company"
                className="mt-1"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Stripe (optional)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Difficulty */}
      <Card>
        <CardHeader>
          <CardTitle>{t(messages, "setup.difficultyLabel")}</CardTitle>
          <CardDescription>{t(messages, "setup.difficultyHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pb-6 sm:grid-cols-3">
          {difficulties.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(coerceDifficulty(d))}
              aria-pressed={difficulty === d}
              className={cn(
                "rounded-[10px] border p-3 text-left transition-colors",
                difficulty === d
                  ? "border-accent bg-accent-soft"
                  : "border-line hover:border-ink",
              )}
            >
              <p className="text-[14px] font-medium text-ink">
                {DIFFICULTY_LABELS[d] ?? d}
              </p>
              <p className="text-[12px] leading-snug text-muted">
                {DIFFICULTY_HINTS[d] ?? ""}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* 3. Voice + language + duration */}
      <Card>
        <CardHeader>
          <CardTitle>{t(messages, "setup.languageLabel")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-6">
          <div className="flex flex-wrap gap-2">
            {languages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setPrimary(lang)}
                aria-pressed={primary === lang}
                className={cn(
                  "rounded-[10px] border px-3.5 py-2 text-[13px] uppercase transition-colors",
                  primary === lang
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-ink-soft hover:border-ink",
                )}
              >
                {lang}
              </button>
            ))}
          </div>

          <div>
            <Label htmlFor="voice">{t(messages, "setup.voiceLabel")}</Label>
            <select
              id="voice"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="mt-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="duration">
              {t(messages, "setup.durationLabel")} ({t(messages, "setup.durationMinutes")})
            </Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Input
                id="duration"
                type="number"
                min={5}
                max={60}
                value={duration}
                onChange={(e) =>
                  setDuration(
                    e.target.value === "" ? DEFAULT_DURATION : clampDuration(Number(e.target.value)),
                  )
                }
                className="w-24"
              />
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDuration(preset)}
                  aria-pressed={duration === preset}
                  className={cn(
                    "rounded-[10px] border px-3 py-1.5 text-[12px] transition-colors",
                    duration === preset
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line text-ink-soft hover:border-ink",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={mixed}
              onChange={(e) => setMixed(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            {t(messages, "setup.languageMixed")}
          </label>
        </CardContent>
      </Card>

      {/* 4. Device check + start */}
      <Card>
        <CardHeader>
          <CardTitle>{t(messages, "setup.deviceLabel")}</CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <DeviceCheck />
        </CardContent>
      </Card>

      {error && (
        <p className="text-[13px] text-ink-soft" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="self-start"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
      >
        {t(messages, "setup.start")}
      </Button>
    </form>
  );
}

// Local fallback matching lib/setup-config's fallback voice; used only before
// the config fetch resolves.
function fallbackConfig(): UiConfig {
  return {
    languages: ["en"],
    voices: { en: { default: "Alba", options: [{ id: "Alba", label: "Alba" }] } },
    difficulties: ["easy", "medium", "hard"],
  };
}
