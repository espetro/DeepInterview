import {
  AgentSession,
  RoomIO,
  defineAgent,
  type JobContext,
} from "@livekit/agents";
import { VAD as SileroVAD } from "@livekit/agents-plugin-silero";
import { LLM as OpenAILLM } from "@livekit/agents-plugin-openai";
import { LLM as AnthropicLLM } from "@livekit/agents-plugin-anthropic";
import { workerConfig, type WorkerConfig } from "./config.ts";
import { DiApiClient } from "./session.ts";
import { InterviewAgent } from "./agent.ts";
import { WhisperStt, whisperStreamAdapter } from "./stt/whisper-stt.ts";
import { PocketTts } from "./tts/pocket-tts.ts";
import type { SessionContext } from "./prompt.ts";

/** Build the provider-configured LLM instance. mock rides the openai plugin. */
export function buildLlm(config: WorkerConfig) {
  const apiKey = config.llm.api_key ?? "not-needed";
  if (config.llm.provider === "anthropic") {
    return new AnthropicLLM({ apiKey, model: config.llm.model, baseURL: config.llm.base_url });
  }
  // openai and mock both speak the OpenAI-compatible protocol.
  return new OpenAILLM({ apiKey, model: config.llm.model, baseURL: config.llm.base_url });
}

export async function runJob(ctx: JobContext): Promise<void> {
  const config = workerConfig();
  // Session id comes from the room name ("interview-<sid>", minted server-side).
  // ctx.room.name is only populated after ctx.connect(), so prefer the job
  // assignment's copy of the room name. AccessToken metadata lands on the
  // participant, not the room, so room metadata is not a reliable channel.
  const roomName = ctx.job.room?.name ?? ctx.room.name ?? "";
  const sessionId =
    readSessionIdFromRoomName(roomName) ??
    readSessionId(ctx.room.metadata ?? "") ??
    crypto.randomUUID();
  const api = new DiApiClient({ baseUrl: config.di_api_base });
  const sessionCtx: SessionContext = { mode: "interview" };
  // Ground the agent in uploaded documents when retrieval is available.
  const context = await api.getContext(sessionId).catch(() => undefined);
  if (context && context.chunks.length > 0) {
    sessionCtx.documents = context.chunks.map((c) => ({
      name: c.document_name,
      text: c.text,
    }));
  }

  await api.postEvent(sessionId, "agent.started", { room: ctx.room.name }).catch((err) => {
    console.warn(`[worker] failed to log agent.started: ${err}`);
  });

  const vad = await SileroVAD.load();
  const sttImpl = new WhisperStt({
    baseUrl: config.stt.base_url,
    apiKey: config.stt.api_key,
    model: config.stt.model,
    language: config.stt.language,
  });
  const ttsImpl = new PocketTts({
    baseUrl: config.tts.base_url,
    apiKey: config.tts.api_key,
    model: config.tts.model,
    voice: config.tts.voice,
  });

  const session = new AgentSession({
    vad,
    stt: whisperStreamAdapter(sttImpl, vad),
    llm: buildLlm(config),
    tts: ttsImpl,
  });

  // Join the room before wiring IO; without this the agent never connects.
  await ctx.connect();

  const room = ctx.room;
  const roomIo = new RoomIO({ agentSession: session, room });
  await session.start({
    room,
    agent: new InterviewAgent(config, { sessionId, api, ctx: sessionCtx }),
    // RoomIO text input (chat/text streams) hits this same LLM pipeline.
    inputOptions: { textEnabled: true, audioEnabled: true },
  });
  roomIo.start();

  // Registered before the greeting: say() emits conversation_item_added during
  // its await, and the greeting turn must not be missed.
  // Seq: fetch the existing turn count first so per-job counters don't collide
  // with turns already persisted (e.g. text input before the agent joined).
  let seq = (
    await api
      .getTurns(sessionId)
      .then((turns) => turns.length)
      .catch(() => 0)
  );
  let seqLock = Promise.resolve();
  session.on("conversation_item_added", (ev) => {
    // Serialize posts so concurrent items keep monotonically increasing seqs.
    seqLock = seqLock.then(() =>
      api
        .postTurn(sessionId, {
          id: crypto.randomUUID(),
          session_id: sessionId,
          seq: seq++,
          speaker: ev.item.role === "user" ? "user" : "agent",
          text: ev.item.textContent ?? "",
          created_at: new Date().toISOString(),
          source: "voice",
        })
        .catch((err) => console.warn(`[worker] failed to post turn: ${err}`)),
    );
  });

  // Greet so the candidate hears the agent first; also guarantees at least one
  // persisted turn even before the candidate speaks.
  try {
    await session.say("Hi, I'm ready to begin your mock interview whenever you are.");
  } catch (err) {
    console.warn(`[worker] greeting failed: ${err}`);
  }
  ctx.addShutdownCallback(async () => {
    await roomIo.close();
    await session.close();
  });
}

function readSessionId(metadata: string): string | undefined {
  try {
    const parsed = JSON.parse(metadata) as { session_id?: string };
    return parsed.session_id;
  } catch {
    return undefined;
  }
}

/** Extract the session id from a room name of the form "interview-<sid>". */
function readSessionIdFromRoomName(roomName: string): string | undefined {
  const prefix = "interview-";
  if (!roomName.startsWith(prefix)) return undefined;
  const sid = roomName.slice(prefix.length);
  return /^[0-9a-f-]{36}$/i.test(sid) ? sid : undefined;
}

export const agent = defineAgent({
  entry: runJob,
  prewarm: async (proc) => {
    proc.userData.vad = await SileroVAD.load();
  },
});

export default agent;

void agent; // re-exported for tests; the bundled agent entry lives in agent-main.ts

/**
 * Standalone entrypoint: validate config, probe the LiveKit endpoint, then run
 * the AgentServer. Exits non-zero with a clear error when LIVEKIT_URL is
 * unreachable so `node worker.js` fails fast in M1.
 */
async function main(): Promise<void> {
  let config: WorkerConfig;
  try {
    config = workerConfig();
  } catch (err) {
    console.error(`[worker] config error:\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const httpUrl = config.livekit.url.replace(/^ws(s?):\/\//, "http$1://");
  try {
    await fetch(`${httpUrl}/`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
  } catch (err) {
    console.error(
      `[worker] cannot reach LiveKit at ${config.livekit.url}: ${err instanceof Error ? err.message : err}\n` +
        `[worker] start a LiveKit server or fix LIVEKIT_URL and retry.`,
    );
    process.exit(2);
  }

  const { AgentServer, ServerOptions } = await import("@livekit/agents");
  const { initializeLogger } = await import("@livekit/agents");
  initializeLogger({ level: "info" });
  const { fileURLToPath } = await import("node:url");
  const server = new AgentServer(
    new ServerOptions({
      agent: fileURLToPath(new URL("./agent.js", import.meta.url)),
      requestFunc: async (job) => {
        await job.accept();
      },
      wsURL: config.livekit.url,
      apiKey: config.livekit.api_key,
      apiSecret: config.livekit.api_secret,
      ...(config.livekit.agent_name ? { agentName: config.livekit.agent_name } : {}),
    }),
  );
  await server.run();
}

// Only auto-run when executed directly (not under vitest or as a child job proc).
if (
  process.env["VITEST"] === undefined &&
  process.env["LIVEKIT_JOB_PROC"] === undefined &&
  process.argv[1]?.endsWith("worker.js")
) {
  main();
}
