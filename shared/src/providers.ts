import * as v from "valibot";

/**
 * BYO (bring-your-own) provider profile for client-only mode: the static
 * web app talks directly to an OpenAI-compatible endpoint with the user's
 * key. The key lives only in browser storage on the user's device and is
 * sent only to the configured base URL (never query strings, never logs).
 */

export const ProviderProfileSchema = v.object({
  /** OpenAI-compatible base URL, e.g. http://localhost:8317/v1 or a cloud endpoint */
  baseUrl: v.pipe(v.string(), v.url()),
  /** API key; treated as a secret, displayed redacted */
  apiKey: v.pipe(v.string(), v.minLength(1)),
  llmModel: v.pipe(v.string(), v.minLength(1)),
  /** /v1/audio/speech voice; empty = provider default */
  ttsVoice: v.optional(v.string(), ""),
  /** /v1/audio/speech model; empty = provider default */
  ttsModel: v.optional(v.string(), ""),
});
export type ProviderProfile = v.InferOutput<typeof ProviderProfileSchema>;

/** Where the interview loop runs. */
export const RuntimeModeSchema = v.picklist(["local-server", "client-only"]);
export type RuntimeMode = v.InferOutput<typeof RuntimeModeSchema>;

/** localStorage key for the persisted runtime selection. */
export const RUNTIME_MODE_STORAGE_KEY = "di.runtime-mode";

/** localStorage key for the persisted provider profile. */
export const PROVIDER_PROFILE_STORAGE_KEY = "di.provider-profile";
