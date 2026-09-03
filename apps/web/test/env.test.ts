import { afterEach, describe, expect, it } from "vitest";
import {
  isLiveKitConfigured,
  publicEnv,
  serverEnv,
} from "../lib/env";

const KEYS = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
] as const;

const saved = new Map<string, string | undefined>();

function snapshot() {
  saved.clear();
  for (const k of KEYS) saved.set(k, process.env[k]);
}

function restore() {
  for (const k of KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function clearAll() {
  for (const k of KEYS) delete process.env[k];
}

afterEach(restore);

describe("provider-configured guards (offline-safe defaults)", () => {
  it("reports unconfigured when no keys are set", () => {
    snapshot();
    clearAll();
    expect(isLiveKitConfigured()).toBe(false);
  });

  it("never throws at import/access time with zero keys (build-safe)", () => {
    snapshot();
    clearAll();
    expect(() => publicEnv.appUrl).not.toThrow();
    expect(publicEnv.appUrl).toBe("http://localhost:3000");
    expect(() => serverEnv.agentApiUrl).not.toThrow();
  });
});
