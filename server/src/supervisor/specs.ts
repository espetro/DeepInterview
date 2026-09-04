import type { Config } from "@di/shared";
import type { ChildSpec } from "./supervisor";

/** Probe the LiveKit HTTP endpoint (derived from the ws:// config url). */
export async function livekitHttpHealthy(url: string): Promise<boolean> {
  const http = url.replace(/^ws(s?):\/\//, "http$1://");
  try {
    const res = await fetch(http, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Child process specs supervised by di:
 *  - worker: agents-js voice agent, run with system Node 24 (onnxruntime natives)
 *  - sfu:    livekit-server --dev (first-run installer fetches the binary)
 */
export function buildChildSpecs(config: Config): ChildSpec[] {
  const specs: ChildSpec[] = [];

  // Pass the merged di config to children as DI_<SECTION>__<KEY> env vars.
  const childEnv: Record<string, string> = {};
  const flatten = (obj: unknown, path: string[]) => {
    if (obj == null) return;
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, [...path, k.toUpperCase()]);
    } else if (typeof obj !== "object") {
      childEnv[`DI_${path.join("__")}`] = String(obj);
    }
  };
  flatten(config, []);
  if (process.env.DI_TEST_MODE === "1") childEnv.DI_STT__MODE = "mock";

  const apiBase = `http://localhost:${config.server.port}`;
  specs.push({
    name: "worker",
    command: ["node", "worker/worker.js"],
    env: {
      ...childEnv,
      DI_API_BASE: apiBase,
    },
    healthy: async () => {
      // The worker is only useful once it can talk to the SFU, so liveness is
      // "LiveKit reachable". Process aliveness is layered on top by the
      // supervisor (exitCode check). A di /api/health probe here would be
      // self-referential (the supervisor serves that endpoint itself).
      return livekitHttpHealthy(config.livekit.url);
    },
  });

  specs.push({
    name: "sfu",
    command: ["livekit-server", "--dev"],
    // SFU health stays process-alive (checked by the supervisor); the HTTP
    // endpoint is the worker's dependency, not a reliable SFU liveness signal.
    healthy: async () => true,
  });

  return specs;
}
