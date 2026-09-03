/**
 * Environment accessors. Read lazily — NEVER throw at import/build time so the
 * app builds and renders with zero configured keys (offline / provider-agnostic).
 *
 * Public values MUST use static `process.env.NEXT_PUBLIC_*` references so Next.js
 * can inline them into the browser bundle. Dynamic indexing is undefined client-side.
 */

/** Browser-safe public config. Inlined by Next at build time. */
export const publicEnv = {
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  },
};

/** Server-only config. Never imported into client components. */
export const serverEnv = {
  get livekitUrl(): string | undefined {
    return process.env.LIVEKIT_URL || undefined;
  },
  get livekitApiKey(): string | undefined {
    return process.env.LIVEKIT_API_KEY || undefined;
  },
  get livekitApiSecret(): string | undefined {
    return process.env.LIVEKIT_API_SECRET || undefined;
  },
  get agentApiUrl(): string {
    return process.env.AGENT_API_URL || "http://localhost:8000";
  },
  /** Shared secret for the agent API's guarded write endpoints (opt-in). */
  get internalApiSecret(): string | undefined {
    return process.env.INTERNAL_API_SECRET || undefined;
  },
  /** Shared secret for the LightRAG sidecar's guarded endpoints (opt-in). */
  get lightragApiSecret(): string | undefined {
    return process.env.LIGHTRAG_API_SECRET || undefined;
  },
};

/** True when LiveKit URL + API credentials are all present. */
export function isLiveKitConfigured(): boolean {
  return Boolean(
    serverEnv.livekitUrl &&
    serverEnv.livekitApiKey &&
    serverEnv.livekitApiSecret,
  );
}
