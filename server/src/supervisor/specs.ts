import type { Config } from "@di/shared";
import type { ChildSpec } from "./supervisor";

/**
 * Child process specs supervised by di:
 *  - worker: agents-js voice agent, run with system Node 24 (onnxruntime natives)
 *  - sfu:    livekit-server --dev (first-run installer fetches the binary)
 */
export function buildChildSpecs(config: Config): ChildSpec[] {
  const specs: ChildSpec[] = [];

  specs.push({
    name: "worker",
    command: ["node", "worker/worker.js"],
    healthy: async () => {
      try {
        const res = await fetch(`http://localhost:${config.server.port}/api/health`, {
          signal: AbortSignal.timeout(2000),
        });
        return res.ok;
      } catch {
        return false;
      }
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
