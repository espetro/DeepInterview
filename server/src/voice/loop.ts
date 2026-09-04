import { v } from "valibot";
import type { Config, Turn, VoiceServerMessage } from "@di/shared";
import {
  AUDIO_HEADER_BYTES,
  CAPTURE_SAMPLE_RATE,
  TTS_SAMPLE_RATE,
  VoiceClientMessageSchema,
} from "@di/shared/voice";
import type { Db } from "../store/db";
import { WavBuffer } from "./stt/wav.ts";
import { WhisperStt } from "./stt/whisper-stt.ts";
import { PocketTts } from "./tts/pocket-tts.ts";
import { OpenAiChatClient, type LlmMessage, type ToolDef } from "./llm.ts";
import { buildPrompt, type SessionContext, type UpdateQuestionArgs } from "./prompt.ts";
import { describeWhiteboardSnapshot } from "./whiteboard.ts";

/** Injectable voice pipeline pieces (tests stub these). */
export interface VoiceStt {
  transcribePcm(pcm: Uint8Array, opts?: { signal?: AbortSignal }): Promise<string>;
}
export interface VoiceTts {
  synthesizeToPcm(text: string, opts?: { signal?: AbortSignal }): Promise<Uint8Array>;
}
export interface VoiceLlm {
  chat(
    messages: LlmMessage[],
    tools?: ToolDef[],
    opts?: { signal?: AbortSignal },
  ): Promise<{ content: string; toolCalls: { name: string; args: Record<string, unknown> }[] }>;
}

export interface VoiceLoopDeps {
  sessionId: string;
  config: Config;
  db: Db;
  send: (msg: VoiceServerMessage) => void;
  sendBinary: (data: Uint8Array) => void;
  stt?: VoiceStt;
  tts?: VoiceTts;
  llm?: VoiceLlm;
}

/** 20ms of PCM16 mono at 24k = 480 samples = 960 bytes. */
const TTS_CHUNK_BYTES = (TTS_SAMPLE_RATE * 2 * 20) / 1000;
const MAX_TOOL_OUTPUT = 4000;

const VOICE_TOOLS: ToolDef[] = [
  {
    name: "update_question",
    description:
      "Rewrite or replace the current interview question and the evaluation hints shown to the candidate. Call whenever the interview focus moves to a new question.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The new current question text" },
        hints: { type: "array", items: { type: "string" }, description: "Evaluation hints for the new question" },
      },
      required: ["question"],
    },
  },
  {
    name: "read_editor",
    description:
      "Read the candidate's current code editor contents from their shared browser workspace. Call when you need to review what they wrote.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_whiteboard",
    description:
      "Read the candidate's shared whiteboard (drawn shapes and their text/connections). Call when you need to see what they sketched.",
    parameters: { type: "object", properties: {} },
  },
];

/**
 * Per-connection voice loop: accumulate streamed PCM frames, transcribe per
 * utterance (client VAD delimits), run one LLM turn, persist turns/events,
 * synthesize speech and stream it back as framed PCM chunks. All in-process;
 * replaces the former @livekit/agents worker.
 */
export class VoiceLoop {
  private readonly sessionId: string;
  private readonly config: Config;
  private readonly db: Db;
  private readonly send: (msg: VoiceServerMessage) => void;
  private readonly sendBinary: (data: Uint8Array) => void;
  private readonly stt: VoiceStt;
  private readonly tts: VoiceTts;
  private readonly llm: VoiceLlm;

  private buffer = new WavBuffer(CAPTURE_SAMPLE_RATE, 1);
  private muted = false;
  private abort: AbortController | undefined;
  private ctx: SessionContext = {};
  private history: LlmMessage[] = [];
  /** Serializes turns so concurrent utterances keep monotonically increasing seqs. */
  private turnLock = Promise.resolve();
  private closed = false;

  constructor(deps: VoiceLoopDeps) {
    this.sessionId = deps.sessionId;
    this.config = deps.config;
    this.db = deps.db;
    this.send = deps.send;
    this.sendBinary = deps.sendBinary;
    const events = { postEvent: (sid: string, type: string, payload?: unknown) => this.postEvent(sid, type, payload) };
    this.stt =
      deps.stt ??
      new WhisperStt({
        baseUrl: this.config.stt.base_url,
        apiKey: this.config.stt.api_key,
        model: this.config.stt.model,
        events,
        sessionId: this.sessionId,
      });
    this.tts =
      deps.tts ??
      new PocketTts({
        baseUrl: this.config.tts.base_url,
        apiKey: this.config.tts.api_key,
        model: this.config.tts.model,
        voice: this.config.tts.voice,
        events,
        sessionId: this.sessionId,
      });
    this.llm =
      deps.llm ??
      new OpenAiChatClient({
        baseUrl: this.config.llm.base_url,
        apiKey: this.config.llm.api_key,
        model: this.config.llm.model,
        events,
        sessionId: this.sessionId,
      });
  }

  /** Call on WS connection open: binds session context and emits agent.started. */
  async start(): Promise<void> {
    const session = await this.db
      .selectFrom("sessions")
      .selectAll()
      .where("id", "=", this.sessionId)
      .executeTakeFirst();
    this.ctx = { mode: session?.mode ?? "interview", title: session?.title, plan: session?.plan ?? undefined };
    await this.postEvent(this.sessionId, "agent.started", { transport: "ws" });
  }

  /** Handle one client WS message (already parsed) or a raw binary audio frame. */
  async handleMessage(msg: v.InferOutput<typeof VoiceClientMessageSchema> | { t: "binary"; data: Uint8Array }): Promise<void> {
    if (this.closed) return;
    if (msg.t === "binary") {
      if (this.muted) return;
      // Strip the 4-byte BE seq header; payload is PCM16LE mono 16k.
      const pcm = msg.data.byteLength > AUDIO_HEADER_BYTES ? msg.data.subarray(AUDIO_HEADER_BYTES) : new Uint8Array(0);
      this.buffer.pushBytes(pcm);
      return;
    }
    if (msg.t === "audio") {
      if (this.muted) return;
      this.buffer.pushBytes(new Uint8Array(Buffer.from(msg.pcm, "base64")));
      return;
    }
    if (msg.t === "mute") {
      this.muted = msg.muted;
      if (msg.muted) this.buffer.clear();
      return;
    }
    if (msg.t === "interrupt") {
      this.abort?.abort();
      this.abort = undefined;
      this.send({ t: "agent_speaking", on: false });
      return;
    }
    if (msg.t === "utterance_end") {
      await this.postEvent(this.sessionId, "vad.speech_ended").catch(() => undefined);
      const pcm = this.buffer.toPcm();
      this.buffer.clear();
      if (pcm.byteLength === 0) return;
      // Serialize: seq assignment and history mutation must not interleave.
      this.turnLock = this.turnLock.then(() => this.runTurn(pcm)).catch((err) => {
        console.error(`[voice] turn failed: ${err}`);
        this.send({ t: "error", message: err instanceof Error ? err.message : String(err) });
      });
      await this.turnLock;
    }
  }

  /** Abort in-flight work and mark the loop dead (WS close). */
  close(): void {
    this.closed = true;
    this.abort?.abort();
    this.abort = undefined;
    this.buffer.clear();
  }

  private async runTurn(pcm: Uint8Array): Promise<void> {
    if (this.closed) return;
    this.abort = new AbortController();
    const { signal } = this.abort;
    try {
      const text = (await this.stt.transcribePcm(pcm, { signal })).trim();
      if (text === "") return;

      const userTurn = await this.persistTurn("user", text);
      this.send({ t: "user_transcript", turn: userTurn });
      this.history.push({ role: "user", content: text });

      const reply = await this.runLlmTurn(signal);

      const agentTurn = await this.persistTurn("agent", reply.content);
      this.history.push({ role: "assistant", content: reply.content });
      this.send({ t: "agent_transcript", turn: agentTurn });

      if (reply.content.trim() === "") return;
      await this.streamSpeech(reply.content, signal);
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || String(err).includes("abort"))) return;
      throw err;
    } finally {
      if (this.abort?.signal === signal) this.abort = undefined;
    }
  }

  /** One LLM round-trip, executing tool calls until a plain reply comes back. */
  private async runLlmTurn(signal: AbortSignal): Promise<{ content: string }> {
    const messages: LlmMessage[] = [
      { role: "system", content: buildPrompt(this.ctx) },
      ...this.history,
    ];
    for (let hop = 0; hop < 4; hop++) {
      const result = await this.llm.chat(messages, VOICE_TOOLS, { signal });
      if (result.toolCalls.length === 0) return { content: result.content };
      const toolResults: { name: string; output: string }[] = [];
      for (const call of result.toolCalls) {
        toolResults.push({ name: call.name, output: await this.executeTool(call.name, call.args) });
      }
      messages.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls.map((c, i) => ({
          id: `call_${hop}_${i}`,
          name: c.name,
          arguments: JSON.stringify(c.args),
        })),
      });
      for (const [i, tr] of toolResults.entries()) {
        messages.push({
          role: "tool",
          content: tr.output,
          tool_call_id: `call_${hop}_${i}`,
        });
      }
    }
    return { content: "" };
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (name === "update_question") {
      const q = args as unknown as UpdateQuestionArgs;
      this.ctx.currentQuestion = q.question;
      if (q.hints) this.ctx.hints = q.hints;
      await this.postEvent(this.sessionId, "question.updated", {
        question: q.question,
        hints: q.hints ?? [],
      });
      return JSON.stringify({ ok: true, question: q.question });
    }
    if (name === "read_editor" || name === "read_whiteboard") {
      const state = await this.readToolState();
      if (name === "read_editor") {
        await this.postEvent(this.sessionId, "tool.read_editor", { length: state.editor.length });
        return JSON.stringify({ text: truncate(state.editor) });
      }
      await this.postEvent(this.sessionId, "tool.read_whiteboard", { length: state.whiteboard.length });
      return JSON.stringify({ text: truncate(describeWhiteboardSnapshot(state.whiteboard)) });
    }
    return JSON.stringify({ error: `unknown tool: ${name}` });
  }

  private async streamSpeech(text: string, signal: AbortSignal): Promise<void> {
    this.send({ t: "agent_speaking", on: true });
    try {
      const pcm = await this.tts.synthesizeToPcm(text, { signal });
      for (let off = 0, seq = 0; off < pcm.length; off += TTS_CHUNK_BYTES, seq++) {
        const chunk = pcm.subarray(off, off + TTS_CHUNK_BYTES);
        const final = off + TTS_CHUNK_BYTES >= pcm.length;
        const frame = new Uint8Array(AUDIO_HEADER_BYTES + chunk.length);
        new DataView(frame.buffer).setUint32(0, seq, false); // BE seq
        frame.set(chunk, AUDIO_HEADER_BYTES);
        this.sendBinary(frame);
        // JSON fallback carries the same chunk so b64-only clients still play.
        this.send({
          t: "tts",
          seq,
          pcm: Buffer.from(chunk).toString("base64"),
          final,
        });
      }
    } finally {
      this.send({ t: "agent_speaking", on: false });
    }
  }

  /** Same sequencing rule as POST /v1/sessions/:id/turns: max seq + 1. */
  private async persistTurn(speaker: "user" | "agent", text: string): Promise<Turn> {
    const [{ max_seq }] = await this.db
      .selectFrom("turns")
      .select((eb) => eb.fn.coalesce(eb.fn.max("seq"), eb.lit(-1)).as("max_seq"))
      .where("session_id", "=", this.sessionId)
      .execute();
    const turn: Turn = {
      id: crypto.randomUUID(),
      session_id: this.sessionId,
      seq: Number(max_seq) + 1,
      speaker,
      text,
      created_at: new Date().toISOString(),
      source: "voice",
    };
    await this.db.insertInto("turns").values(turn).execute();
    return turn;
  }

  private async readToolState(): Promise<{ editor: string; whiteboard: string }> {
    const row = await this.db
      .selectFrom("tool_state")
      .selectAll()
      .where("id", "=", this.sessionId)
      .executeTakeFirst();
    return { editor: row?.editor ?? "", whiteboard: row?.whiteboard ?? "" };
  }

  /** In-process event write (replaces the worker's HTTP postEvent round-trip). */
  private async postEvent(sessionId: string, type: string, payload?: unknown): Promise<void> {
    await this.db
      .insertInto("events")
      .values({
        session_id: sessionId,
        type,
        payload: payload === undefined ? null : JSON.stringify(payload),
        at: new Date().toISOString(),
      })
      .execute();
  }
}

function truncate(text: string, max = MAX_TOOL_OUTPUT): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [truncated]`;
}
