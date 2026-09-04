import * as v from "valibot";
import { CONFIG_ENV_PREFIX, CONFIG_ENV_SEPARATOR } from "@di/shared";

export const WorkerConfigSchema = v.object({
  livekit: v.object({
    url: v.pipe(v.string(), v.url()),
    api_key: v.string(),
    api_secret: v.string(),
    agent_name: v.optional(v.string()),
  }),
  di_api_base: v.pipe(v.string(), v.url()),
  llm: v.object({
    provider: v.picklist(["openai", "anthropic", "mock"]),
    base_url: v.pipe(v.string(), v.url()),
    api_key: v.optional(v.string()),
    model: v.string(),
  }),
  stt: v.object({
    base_url: v.pipe(v.string(), v.url()),
    api_key: v.optional(v.string()),
    model: v.string(),
    language: v.optional(v.string(), "en"),
  }),
  tts: v.object({
    base_url: v.pipe(v.string(), v.url()),
    api_key: v.optional(v.string()),
    model: v.string(),
    voice: v.string(),
  }),
});

export type WorkerConfig = v.InferOutput<typeof WorkerConfigSchema>;

function readEnv(): Record<string, string> {
  // Merge process.env with any dotenv-style entries already loaded by Bun/Node.
  return { ...process.env } as Record<string, string>;
}

/**
 * Read a nested key following the shared DI_ + "__" convention, e.g.
 * DI_LLM__BASE_URL -> llm.base_url. Returns undefined when unset.
 */
export function envKey(env: Record<string, string>, path: string[]): string | undefined {
  const key = (CONFIG_ENV_PREFIX + path.join(CONFIG_ENV_SEPARATOR)).toUpperCase();
  return env[key];
}

function required(env: Record<string, string>, path: string[], what: string): string {
  const value = envKey(env, path);
  if (value === undefined || value === "") {
    throw new Error(
      `worker config: missing required env var ${(CONFIG_ENV_PREFIX + path.join(CONFIG_ENV_SEPARATOR)).toUpperCase()} (${what})`,
    );
  }
  return value;
}

function optional(env: Record<string, string>, path: string[]): string | undefined {
  const value = envKey(env, path);
  return value === "" ? undefined : value;
}

export function buildWorkerConfig(
  env: Record<string, string> = readEnv(),
): WorkerConfig {
  const provider = optional(env, ["LLM", "PROVIDER"]) ?? "openai";
  const config: WorkerConfig = {
    livekit: {
      url: required(env, ["LIVEKIT", "URL"], "LiveKit server URL"),
      api_key: required(env, ["LIVEKIT", "API_KEY"], "LiveKit API key"),
      api_secret: required(env, ["LIVEKIT", "API_SECRET"], "LiveKit API secret"),
      agent_name: optional(env, ["LIVEKIT", "AGENT_NAME"]),
    },
    di_api_base: optional(env, ["API_BASE"]) ?? "http://localhost:8080",
    llm: {
      provider: v.parse(v.picklist(["openai", "anthropic", "mock"]), provider),
      base_url: required(env, ["LLM", "BASE_URL"], "LLM base URL"),
      api_key: optional(env, ["LLM", "API_KEY"]),
      model: required(env, ["LLM", "MODEL"], "LLM model name"),
    },
    stt: {
      base_url: required(env, ["STT", "BASE_URL"], "STT base URL"),
      api_key: optional(env, ["STT", "API_KEY"]),
      model: required(env, ["STT", "MODEL"], "STT model name"),
      language: optional(env, ["STT", "LANGUAGE"]) ?? "en",
    },
    tts: {
      base_url: required(env, ["TTS", "BASE_URL"], "TTS base URL"),
      api_key: optional(env, ["TTS", "API_KEY"]),
      model: required(env, ["TTS", "MODEL"], "TTS model name"),
      voice: optional(env, ["TTS", "VOICE"]) ?? "alloy",
    },
  };
  return v.parse(WorkerConfigSchema, config);
}

let cached: WorkerConfig | undefined;

export function workerConfig(): WorkerConfig {
  cached ??= buildWorkerConfig();
  return cached;
}

/**
 * Clear the process-wide config cache. Config is read once per worker
 * process by design (env doesn't change mid-job), but that same caching
 * silently poisons any test that calls workerConfig() (directly, or via
 * runJob) more than once with different env in the same process — call
 * this in beforeEach when a test suite does that.
 */
export function resetWorkerConfigCacheForTests(): void {
  cached = undefined;
}
