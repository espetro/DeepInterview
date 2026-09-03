import type { Config } from "@di/shared";
import type { ChildSpec } from "./supervisor";

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
      // The worker registers with LiveKit and only exits on fatal errors, so
      // liveness is "process still running". A di /api/health probe here would
      // be self-referential (the supervisor serves that endpoint itself) and
      // says nothing about the child.
      return true;
    },
  });

  specs.push({
    name: "sfu",
    command: ["livekit-server", "--dev"],
    healthy: async () => {
      try {
        const res = await fetch("http://localhost:7880", {
          signal: AbortSignal.timeout(2000),
        });
        return res.status < 500;
      } catch {
        return false;
      }
    },
  });

  return specs;
}
