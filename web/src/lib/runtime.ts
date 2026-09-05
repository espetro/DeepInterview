import { persistentAtom } from "@nanostores/persistent";
import { computed } from "nanostores";
import * as v from "valibot";
import {
  PROVIDER_PROFILE_STORAGE_KEY,
  ProviderProfileSchema,
  RUNTIME_MODE_STORAGE_KEY,
  type ProviderProfile,
  type RuntimeMode,
} from "@di/shared";

/**
 * Runtime selection: local server (default) or client-only (BYO provider,
 * static deploy, no di binary). The mode is persisted; an unreachable server
 * never rewrites the persisted choice, it only changes the effective runtime
 * used by driver/route wiring.
 */

export const $runtimeMode = persistentAtom<RuntimeMode>(RUNTIME_MODE_STORAGE_KEY, "local-server");

const StoredProfileSchema = v.union([ProviderProfileSchema, v.null()]);

/** null = no BYO provider configured (client-only mode requires one). */
export const $providerProfile = persistentAtom<ProviderProfile | null>(
  PROVIDER_PROFILE_STORAGE_KEY,
  null,
  {
    encode: (value) => JSON.stringify(value),
    decode: (raw) => {
      const parsed = v.safeParse(StoredProfileSchema, JSON.parse(raw));
      return parsed.success ? parsed.output : null;
    },
  },
);

/** Show first 3 + last 2 chars of a secret key; short keys collapse to dots. */
export function redactKey(key: string): string {
  if (key.length <= 5) return "•".repeat(key.length);
  return `${key.slice(0, 3)}${"•".repeat(Math.min(key.length - 5, 8))}${key.slice(-2)}`;
}

export const $serverReachable = persistentAtom<boolean | null>("di.server-reachable", null, {
  encode: String,
  decode: (raw) => (raw === "true" ? true : raw === "false" ? false : null),
});

const API_BASE = import.meta.env.VITE_DI_API_BASE as string | undefined ?? "";

/**
 * Probe ${API_BASE}/api/health with a 2s timeout; updates $serverReachable
 * (cached in storage so offline reloads stay in client-only without a probe
 * round-trip). Same probe voice driver selection uses.
 */
export async function probeServer(): Promise<boolean> {
  const pinned = import.meta.env.VITE_VOICE_DEFAULT;
  if (pinned === "browser") {
    $serverReachable.set(false);
    return false;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    const ok = res.ok;
    $serverReachable.set(ok);
    return ok;
  } catch {
    $serverReachable.set(false);
    return false;
  }
}

/**
 * Effective runtime: client-only when the persisted mode says so, or when the
 * chosen local server cannot be reached (probe result; null = not probed yet,
 * trust the persisted mode). Read-only derived, never mutates $runtimeMode.
 */
export const $effectiveRuntime = computed(
  [$runtimeMode, $serverReachable],
  (mode, reachable): RuntimeMode =>
    mode === "client-only" || (mode === "local-server" && reachable === false)
      ? "client-only"
      : "local-server",
);

/** Kick off the probe once per app; safe to call repeatedly. */
let probeStarted = false;
export function ensureRuntimeProbe(): void {
  if (probeStarted) return;
  probeStarted = true;
  if ($runtimeMode.get() === "local-server" && $serverReachable.get() !== true) {
    void probeServer();
  }
}
