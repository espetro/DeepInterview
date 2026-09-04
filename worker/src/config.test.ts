import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt.ts";
import { buildWorkerConfig, envKey } from "./config.ts";

describe("buildPrompt", () => {
  it("includes mode and question", () => {
    const prompt = buildPrompt({ mode: "interview", currentQuestion: "Tell me about X" });
    expect(prompt).toContain("interview");
    expect(prompt).toContain("Tell me about X");
  });

  it("includes plan, title, and hints", () => {
    const prompt = buildPrompt({
      mode: "coach",
      title: "Backend screen",
      plan: "1. Warmup\n2. Systems",
      currentQuestion: "Why?",
      hints: ["mentions caching", "discusses tradeoffs"],
    });
    expect(prompt).toContain("coach");
    expect(prompt).toContain("Backend screen");
    expect(prompt).toContain("1. Warmup");
    expect(prompt).toContain("mentions caching; discusses tradeoffs");
  });

  it("includes retrieved document chunks when present", () => {
    const prompt = buildPrompt({
      mode: "interview",
      documents: [{ name: "resume.pdf", text: "built the billing pipeline" }],
    });
    expect(prompt).toContain("resume.pdf");
    expect(prompt).toContain("built the billing pipeline");
  });

  it("omits the documents section when no chunks", () => {
    expect(buildPrompt({ mode: "interview" })).not.toContain("reference documents");
  });
});

describe("worker config env parsing", () => {
  const baseEnv = {
    DI_LIVEKIT__URL: "ws://localhost:7880",
    DI_LIVEKIT__API_KEY: "devkey",
    DI_LIVEKIT__API_SECRET: "secret",
    DI_LLM__PROVIDER: "mock",
    DI_LLM__BASE_URL: "http://localhost:8080/v1",
    DI_LLM__MODEL: "mock-model",
    DI_STT__BASE_URL: "http://localhost:8080",
    DI_STT__MODEL: "whisper-1",
    DI_TTS__BASE_URL: "http://localhost:8080",
    DI_TTS__MODEL: "pocket",
    DI_TTS__VOICE: "alloy",
  };

  it("builds config from DI_-prefixed env", () => {
    const config = buildWorkerConfig(baseEnv);
    expect(config.di_api_base).toBe("http://localhost:8080");
    expect(config.llm.provider).toBe("mock");
    expect(config.stt.model).toBe("whisper-1");
    expect(config.tts.voice).toBe("alloy");
  });

  it("honors DI_API_BASE override", () => {
    const config = buildWorkerConfig({ ...baseEnv, DI_API_BASE: "http://elsewhere:9000" });
    expect(config.di_api_base).toBe("http://elsewhere:9000");
  });

  it("rejects missing required keys", () => {
    expect(() => buildWorkerConfig({})).toThrow(/DI_LIVEKIT__URL/);
  });

  it("envKey joins prefix and separator", () => {
    expect(envKey(baseEnv, ["llm", "model"])).toBe("mock-model");
    expect(envKey(baseEnv, ["nope"])).toBeUndefined();
  });

  // Required keys, one per row. Table-driven: dropping or blanking any single
  // one must fail with that key's own name in the error, and nothing else's.
  const requiredKeys = [
    "DI_LIVEKIT__URL",
    "DI_LIVEKIT__API_KEY",
    "DI_LIVEKIT__API_SECRET",
    "DI_LLM__BASE_URL",
    "DI_LLM__MODEL",
    "DI_STT__BASE_URL",
    "DI_STT__MODEL",
    "DI_TTS__BASE_URL",
    "DI_TTS__MODEL",
  ] as const;

  it.each(requiredKeys)("rejects missing %s", (key) => {
    const { [key]: _omit, ...rest } = baseEnv;
    expect(() => buildWorkerConfig(rest)).toThrow(new RegExp(key));
  });

  it.each(requiredKeys)("rejects blank %s (empty string treated as unset)", (key) => {
    expect(() => buildWorkerConfig({ ...baseEnv, [key]: "" })).toThrow(new RegExp(key));
  });

  // Malformed values: each row targets one field's validation independent of
  // the others, so a regression in one picklist/url check can't hide behind
  // another field's default.
  const malformedCases: Array<{ name: string; env: Record<string, string>; match: RegExp }> = [
    { name: "non-URL livekit url", env: { DI_LIVEKIT__URL: "not-a-url" }, match: /url|Invalid/i },
    { name: "non-URL llm base_url", env: { DI_LLM__BASE_URL: "not-a-url" }, match: /url|Invalid/i },
    { name: "non-URL stt base_url", env: { DI_STT__BASE_URL: "not-a-url" }, match: /url|Invalid/i },
    { name: "non-URL tts base_url", env: { DI_TTS__BASE_URL: "not-a-url" }, match: /url|Invalid/i },
    { name: "non-URL di_api_base", env: { DI_API_BASE: "not-a-url" }, match: /url|Invalid/i },
    {
      name: "unknown llm provider",
      env: { DI_LLM__PROVIDER: "bogus" },
      match: /Invalid|picklist|type/i,
    },
  ];

  it.each(malformedCases)("rejects malformed: $name", ({ env, match }) => {
    expect(() => buildWorkerConfig({ ...baseEnv, ...env })).toThrow(match);
  });

  // Optional keys default when absent/blank, and pass through verbatim when
  // present. Table over the (key, path, default) triples so adding a new
  // optional field just means adding a row.
  const optionalCases: Array<{
    key: string;
    read: (c: ReturnType<typeof buildWorkerConfig>) => string | undefined;
    default: string | undefined;
    value: string;
  }> = [
    { key: "DI_API_BASE", read: (c) => c.di_api_base, default: "http://localhost:8080", value: "http://elsewhere:9000" },
    { key: "DI_LIVEKIT__AGENT_NAME", read: (c) => c.livekit.agent_name, default: undefined, value: "interviewer" },
    { key: "DI_LLM__PROVIDER", read: (c) => c.llm.provider, default: "openai", value: "anthropic" },
    { key: "DI_LLM__API_KEY", read: (c) => c.llm.api_key, default: undefined, value: "sk-llm" },
    { key: "DI_STT__API_KEY", read: (c) => c.stt.api_key, default: undefined, value: "sk-stt" },
    { key: "DI_STT__LANGUAGE", read: (c) => c.stt.language, default: "en", value: "fr" },
    { key: "DI_TTS__API_KEY", read: (c) => c.tts.api_key, default: undefined, value: "sk-tts" },
    { key: "DI_TTS__VOICE", read: (c) => c.tts.voice, default: "alloy", value: "verse" },
  ];

  it.each(optionalCases)("defaults $key when absent", ({ key, read, default: def }) => {
    // baseEnv sets DI_LLM__PROVIDER itself (to exercise the "mock" provider
    // elsewhere in this file), so testing that key's default means starting
    // from an env without it rather than from baseEnv.
    const { [key]: _omit, ...envWithoutKey } = baseEnv as Record<string, string>;
    expect(read(buildWorkerConfig(envWithoutKey))).toBe(def);
  });

  it.each(optionalCases)("defaults $key when blank", ({ key, read, default: def }) => {
    expect(read(buildWorkerConfig({ ...baseEnv, [key]: "" }))).toBe(def);
  });

  it.each(optionalCases)("honors $key when present", ({ key, read, value }) => {
    expect(read(buildWorkerConfig({ ...baseEnv, [key]: value }))).toBe(value);
  });
});

describe("envKey", () => {
  // Table over path shapes: single/nested keys, case folding, and the
  // "unset" case all live in one property-ish grid instead of one-off tests.
  const cases: Array<{ path: string[]; env: Record<string, string>; expected: string | undefined }> = [
    { path: ["api_base"], env: { DI_API_BASE: "x" }, expected: "x" },
    { path: ["llm", "model"], env: { DI_LLM__MODEL: "gpt" }, expected: "gpt" },
    { path: ["LLM", "MODEL"], env: { DI_LLM__MODEL: "gpt" }, expected: "gpt" }, // path case is irrelevant; key is uppercased
    { path: ["livekit", "api_key"], env: { DI_LIVEKIT__API_KEY: "k" }, expected: "k" },
    { path: ["missing"], env: {}, expected: undefined },
    { path: ["llm", "model"], env: { DI_LLM__MODEL: "" }, expected: "" }, // envKey itself doesn't treat "" as unset
  ];

  it.each(cases)("envKey($path) -> $expected", ({ path, env, expected }) => {
    expect(envKey(env, path)).toBe(expected);
  });
});
