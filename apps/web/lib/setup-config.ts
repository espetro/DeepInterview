/**
 * Client-side model of the agent's `GET /api/config/ui` response, plus the
 * pure helpers the setup form runs on it. Kept free of React/Next so it is
 * trivially unit-testable (see test/setup-config.test.ts).
 *
 * The live config is file-driven on the agent (`apps/agent/config/ui.toml`);
 * everything here degrades to safe fallbacks when the agent is unreachable.
 */

import type { PrepRequest } from "@deepinterview/shared";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Difficulty the form starts on; matches the PrepRequest schema default. */
export const DEFAULT_DIFFICULTY: Difficulty = "medium";

export const DURATION_MIN = 5;
export const DURATION_MAX = 60;
export const DEFAULT_DURATION = 30;
/** One-click interview lengths shown next to the number input. */
export const DURATION_PRESETS = [20, 30, 45, 60] as const;

/** Last-resort voice when the agent is unreachable. English default. */
export const FALLBACK_VOICE = "Alba";
/** Last-resort language list when the agent is unreachable. */
export const FALLBACK_LANGUAGES = ["en"] as const;

export interface VoiceOption {
  id: string;
  label: string;
}

export interface VoiceSet {
  /** Voice id used when the user doesn't pick one. */
  default: string;
  options: VoiceOption[];
}

export interface UiConfig {
  languages: string[];
  voices: Record<string, VoiceSet>;
  difficulties: string[];
}

/** Safe config used before the fetch resolves or when it fails. */
export function fallbackUiConfig(): UiConfig {
  return {
    languages: [...FALLBACK_LANGUAGES],
    voices: {
      en: { default: FALLBACK_VOICE, options: [{ id: FALLBACK_VOICE, label: FALLBACK_VOICE }] },
    },
    difficulties: [...DIFFICULTIES],
  };
}

/**
 * Parse the agent's `/api/config/ui` JSON. Tolerant: any shape problem or
 * null input yields the fallback config instead of throwing.
 */
export function parseUiConfig(data: unknown): UiConfig {
  if (typeof data !== "object" || data === null) return fallbackUiConfig();
  const raw = data as Record<string, unknown>;

  const languages =
    Array.isArray(raw.languages) && raw.languages.every((l) => typeof l === "string")
      ? (raw.languages as string[])
      : [...FALLBACK_LANGUAGES];

  const voices: Record<string, VoiceSet> = {};
  if (typeof raw.voices === "object" && raw.voices !== null) {
    for (const [lang, entry] of Object.entries(raw.voices)) {
      if (typeof entry !== "object" || entry === null) continue;
      const v = entry as Record<string, unknown>;
      const options = Array.isArray(v.options)
        ? v.options
            .filter(
              (o): o is Record<string, unknown> =>
                typeof o === "object" && o !== null && typeof (o as { id?: unknown }).id === "string",
            )
            .map((o) => ({
              id: o.id as string,
              label: typeof o.label === "string" ? o.label : (o.id as string),
            }))
        : [];
      const def = typeof v.default === "string" ? v.default : options[0]?.id;
      if (!def) continue;
      voices[lang] = {
        default: def,
        // Ensure the default itself is selectable even if the options list omitted it.
        options: options.some((o) => o.id === def)
          ? options
          : [{ id: def, label: def }, ...options],
      };
    }
  }

  const difficulties =
    Array.isArray(raw.difficulties) && raw.difficulties.every((d) => typeof d === "string")
      ? (raw.difficulties as string[])
      : [...DIFFICULTIES];

  return {
    languages: languages.length ? languages : [...FALLBACK_LANGUAGES],
    voices: Object.keys(voices).length ? voices : fallbackUiConfig().voices,
    difficulties: difficulties.length ? difficulties : [...DIFFICULTIES],
  };
}

/**
 * Fetch the UI config from our thin proxy route (`app/api/config/ui`), which
 * keeps AGENT_API_URL server-only. NEVER throws — on any failure the caller
 * gets the fallback config so the form still renders.
 */
export async function fetchUiConfig(): Promise<UiConfig> {
  try {
    const res = await fetch("/api/config/ui", { cache: "no-store" });
    if (!res.ok) return fallbackUiConfig();
    return parseUiConfig(await res.json());
  } catch {
    return fallbackUiConfig();
  }
}

/** Clamp a duration to the [5, 60] minutes band the PrepRequest schema allows. */
export function clampDuration(min: number): number {
  if (!Number.isFinite(min)) return DEFAULT_DURATION;
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(min)));
}

/**
 * Pick the initially-selected voice id for a language: the config's default
 * entry, else the language fallback ("Alba"), else the first option.
 */
export function defaultVoiceId(config: UiConfig, language: string): string {
  const set = config.voices[language];
  if (!set) return FALLBACK_VOICE;
  return (
    set.options.find((o) => o.id === set.default)?.id ?? set.options[0]?.id ?? FALLBACK_VOICE
  );
}

/** Coerce a raw difficulty string into the known enum, defaulting to medium. */
export function coerceDifficulty(value: string | undefined | null): Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value ?? "")
    ? (value as Difficulty)
    : DEFAULT_DIFFICULTY;
}

/** Inputs the setup form collects before submit. */
export interface SetupFormValues {
  /** Pasted CV text (wins over the file when both exist). */
  cvText: string;
  /** Data-URL of the uploaded file's raw bytes (FileReader.readAsDataURL). */
  cvFileDataUrl?: string;
  jdText: string;
  company: string;
  languageMode: { primary: string; mixed: boolean };
  difficulty: Difficulty;
  voice: string;
  duration: number;
}

/**
 * Build the `POST /api/prep?fast=true` body from raw form values.
 *
 * CV resolution: pasted text wins on collision (documented in the form UI);
 * when only a file was chosen its base64 data-URL is sent as `cv_url` and the
 * agent parses the real PDF/DOCX. voice is omitted when empty so the agent
 * falls back to the language default; duration is clamped to 5..60.
 *
 * Returns a plain (string-typed) shape; the caller casts primary into the
 * shared Language enum — languages outside the enum are rejected server-side
 * by the agent's prep route (STT gate), so the cast is safe.
 */
export function buildPrepRequest(v: SetupFormValues): Omit<PrepRequest, "language_mode"> & {
  language_mode: { primary: string; mixed: boolean };
} {
  const cv_url = v.cvText.trim() || v.cvFileDataUrl || "";
  return {
    cv_url,
    jd_text: v.jdText.trim(),
    company: v.company.trim(),
    language_mode: v.languageMode,
    difficulty: v.difficulty,
    voice: v.voice || undefined,
    duration_min: clampDuration(v.duration),
  };
}
