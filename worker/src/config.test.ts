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
});
