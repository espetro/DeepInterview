import { describe, expect, it } from "vitest";
import {
  clampDuration,
  coerceDifficulty,
  defaultVoiceId,
  buildPrepRequest,
  fetchUiConfig,
  fallbackUiConfig,
  parseUiConfig,
  DEFAULT_DIFFICULTY,
  DEFAULT_DURATION,
  FALLBACK_VOICE,
} from "@/lib/setup-config";

// Match the agent's `GET /api/config/ui` payload shape (apps/agent/config/ui.toml).
const AGENT_PAYLOAD = {
  languages: ["en", "fr"],
  voices: {
    en: {
      default: "alba",
      options: [
        { id: "alba", label: "Alba" },
        { id: "mariam", label: "Mariam" },
      ],
    },
    fr: {
      default: "estelle",
      options: [{ id: "estelle", label: "Estelle" }],
    },
  },
  difficulties: ["easy", "medium", "hard"],
};

describe("parseUiConfig", () => {
  it("parses a well-formed agent payload", () => {
    const cfg = parseUiConfig(AGENT_PAYLOAD);
    expect(cfg.languages).toEqual(["en", "fr"]);
    expect(cfg.voices.en?.default).toBe("alba");
    expect(cfg.voices.en?.options[1]).toEqual({ id: "mariam", label: "Mariam" });
    expect(cfg.difficulties).toEqual(["easy", "medium", "hard"]);
  });

  it("falls back when the agent is unreachable / body is garbage", () => {
    for (const bad of [null, undefined, 42, "nope", { languages: "en" }]) {
      expect(parseUiConfig(bad)).toEqual(fallbackUiConfig());
    }
  });

  it("falls back on empty languages / voices / difficulties", () => {
    expect(parseUiConfig({ languages: [], voices: {}, difficulties: [] })).toEqual(
      fallbackUiConfig(),
    );
  });

  it("fills fetchUiConfig fallbacks on a failed fetch", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("agent down");
    }) as typeof fetch;
    try {
      expect(await fetchUiConfig()).toEqual(fallbackUiConfig());
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("clampDuration", () => {
  it("clamps to the 5..60 PrepRequest band", () => {
    expect(clampDuration(1)).toBe(5);
    expect(clampDuration(4.6)).toBe(5);
    expect(clampDuration(30)).toBe(30);
    expect(clampDuration(60)).toBe(60);
    expect(clampDuration(999)).toBe(60);
  });

  it("falls back to the default on non-numeric input", () => {
    expect(clampDuration(Number.NaN)).toBe(DEFAULT_DURATION);
    expect(clampDuration(Number.POSITIVE_INFINITY)).toBe(DEFAULT_DURATION);
  });
});

describe("coerceDifficulty", () => {
  it("keeps known levels", () => {
    expect(coerceDifficulty("easy")).toBe("easy");
    expect(coerceDifficulty("hard")).toBe("hard");
  });

  it("defaults to medium", () => {
    expect(coerceDifficulty(undefined)).toBe(DEFAULT_DIFFICULTY);
    expect(coerceDifficulty("impossible")).toBe("medium");
    expect(DEFAULT_DIFFICULTY).toBe("medium");
  });
});

describe("defaultVoiceId", () => {
  it("uses the config's default:true entry", () => {
    expect(defaultVoiceId(parseUiConfig(AGENT_PAYLOAD), "en")).toBe("alba");
    expect(defaultVoiceId(parseUiConfig(AGENT_PAYLOAD), "fr")).toBe("estelle");
  });

  it("falls back to Alba for unknown languages / failed fetches", () => {
    expect(defaultVoiceId(fallbackUiConfig(), "de")).toBe(FALLBACK_VOICE);
    expect(defaultVoiceId(parseUiConfig({ languages: ["en"] }), "en")).toBe(FALLBACK_VOICE);
  });
});

describe("buildPrepRequest", () => {
  const base = {
    jdText: "  Senior backend role  ",
    company: " Stripe ",
    languageMode: { primary: "en", mixed: false },
    difficulty: "medium" as const,
    voice: "alba",
    duration: 90,
  };

  it("builds the PrepRequest body: trims fields, clamps duration", () => {
    const body = buildPrepRequest({ ...base, cvText: " My CV text " });
    expect(body).toEqual({
      cv_url: "My CV text",
      jd_text: "Senior backend role",
      company: "Stripe",
      language_mode: { primary: "en", mixed: false },
      difficulty: "medium",
      voice: "alba",
      duration_min: 60,
    });
  });

  it("prefers pasted CV text over the uploaded file on collision", () => {
    const body = buildPrepRequest({
      ...base,
      cvText: "pasted wins",
      cvFileDataUrl: "data:application/pdf;base64,AAA",
    });
    expect(body.cv_url).toBe("pasted wins");
  });

  it("uses the file data-URL when nothing was pasted", () => {
    const body = buildPrepRequest({
      ...base,
      cvText: "   ",
      cvFileDataUrl: "data:application/pdf;base64,AAA",
    });
    expect(body.cv_url).toBe("data:application/pdf;base64,AAA");
  });

  it("omits empty voice so the agent picks the language default", () => {
    const body = buildPrepRequest({ ...base, cvText: "cv", voice: "" });
    expect("voice" in body && body.voice === undefined).toBe(true);
  });
});
