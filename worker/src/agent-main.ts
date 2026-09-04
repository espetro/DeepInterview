/**
 * Agent entry module: the file whose default export the job child process
 * imports (worker.js passes this file's path to ServerOptions). Kept as a
 * separate bundle from worker.js because the job proc imports it fresh via
 * dynamic import — it must not auto-run the AgentServer.
 */
import { VAD as SileroVAD } from "@livekit/agents-plugin-silero";
import { defineAgent } from "@livekit/agents";
import { runJob } from "./entry.ts";

export const agent = defineAgent({
  entry: runJob,
  prewarm: async (proc) => {
    proc.userData.vad = await SileroVAD.load();
  },
});

export default agent;
