import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { VOICE_TOOLS, assertNever, buildPrompt, describeWhiteboardSnapshot } from "@di/shared";
import type {
  ProviderEndpoint,
  SessionContext,
  ToolDef,
  TurnEvents,
  TurnPhase,
  TurnRunner,
  UpdateQuestionArgs,
} from "@di/shared";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createOpenAiCompatibleModel } from "./openai-compatible-provider";

/**
 * ClientAgent: the client-only interview loop. Mirrors the server's VoiceLoop
 * LLM hop (system prompt from shared buildPrompt + the three VOICE_TOOLS)
 * using the AI SDK's streamText + our openai-compatible provider. The `ai`
 * package is imported lazily so local-server builds don't pay for it.
 */

export interface AgentToolExecutors {
  update_question(args: UpdateQuestionArgs): Promise<string>;
  read_editor(args: Record<string, never>): Promise<string>;
  read_whiteboard(args: Record<string, never>): Promise<string>;
}

/** Plain JSON-schema tool spec sent to the model (from shared VOICE_TOOLS). */
function toolDef(name: string): ToolDef {
  const def = VOICE_TOOLS.find((t) => t.name === name);
  if (!def) throw new Error(`unknown voice tool: ${name}`);
  return def;
}

export interface RespondOptions extends TurnEvents {
  signal?: AbortSignal;
}

/** Default error sink: never swallow, always surface to the console. */
function defaultOnError(error: unknown, phase: TurnPhase): void {
  switch (phase) {
    case "llm":
      console.error("[ClientAgent] llm turn failed", error);
      break;
    case "tool":
      console.error("[ClientAgent] tool call failed", error);
      break;
    case "tts":
      console.error("[ClientAgent] tts failed", error);
      break;
    default:
      assertNever(phase);
  }
}

/** Same hop budget as the server's VoiceLoop (server/src/voice/loop.ts). */
const MAX_HOPS = 4;

/** Internal chat message history (assistant text only; tool hops inline). */
interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ClientAgent implements TurnRunner {
  private history: ChatMsg[] = [];
  private model: LanguageModelV3;

  constructor(
    private readonly llm: ProviderEndpoint,
    private readonly tools: AgentToolExecutors,
    private readonly getContext: () => SessionContext,
    private readonly fetchImpl?: typeof fetch,
  ) {
    this.model = createOpenAiCompatibleModel(this.llm, { fetchImpl });
  }

  /** Full transcript so far (for persistence/report). */
  get messages(): ChatMsg[] {
    return this.history;
  }

  reset(): void {
    this.history = [];
  }

  /**
   * One user turn: append the user message, then run streamText with the
   * three tools. onText fires for every assistant text delta of the final
   * answer. Resolves with the full final text.
   */
  async respond(userText: string, opts: RespondOptions = {}): Promise<string> {
    this.history.push({ role: "user", content: userText });
    const onError = opts.onError ?? defaultOnError;
    const { streamText, jsonSchema, stepCountIs, NoSuchToolError, InvalidToolInputError } =
      await import("ai");
    const t0 = Date.now();
    let llmTtftMs: number | undefined;
    const result = streamText({
      model: this.model,
      system: buildPrompt(this.getContext()),
      messages: this.history.map((m) => ({ role: m.role, content: m.content })),
      tools: {
        update_question: {
          description: toolDef("update_question").description,
          inputSchema: jsonSchema(
            toJsonSchema(
              v.object({
                question: v.string(),
                hints: v.optional(v.array(v.string()), []),
              }),
            ),
          ),
          execute: async (input: { question: string; hints?: string[] }) =>
            this.tools.update_question({
              question: input.question,
              hints: input.hints,
            }),
        },
        read_editor: {
          description: toolDef("read_editor").description,
          inputSchema: jsonSchema(toJsonSchema(v.object({}))),
          execute: async () => this.tools.read_editor({}),
        },
        read_whiteboard: {
          description: toolDef("read_whiteboard").description,
          inputSchema: jsonSchema(toJsonSchema(v.object({}))),
          execute: async () => this.tools.read_whiteboard({}),
        },
      },
      abortSignal: opts.signal,
      stopWhen: stepCountIs(MAX_HOPS),
      onError: ({ error }: { error: unknown }) => {
        const phase: TurnPhase =
          NoSuchToolError.isInstance(error) || InvalidToolInputError.isInstance(error)
            ? "tool"
            : "llm";
        onError(error, phase);
      },
    });

    let full = "";
    for await (const delta of result.textStream) {
      if (llmTtftMs === undefined) llmTtftMs = Date.now() - t0;
      full += delta;
      opts.onText?.(delta);
    }
    if (full.trim()) this.history.push({ role: "assistant", content: full });
    opts.onMetrics?.({
      vad_ms: 0,
      llm_ttft_ms: llmTtftMs,
      total_ms: Date.now() - t0,
    });
    return full;
  }
}

/** Convenience executor set backed by the client stores (editor/whiteboard/question). */
export function createStoreToolExecutors(deps: {
  editorGetter: () => string;
  whiteboardGetter: () => string;
  onQuestion: (q: { text: string; hints: string[] }) => void;
}): AgentToolExecutors {
  return {
    async update_question(args) {
      deps.onQuestion({ text: args.question, hints: args.hints ?? [] });
      return "ok";
    },
    async read_editor() {
      const text = deps.editorGetter();
      return text.trim() ? text : "(editor is empty)";
    },
    async read_whiteboard() {
      const json = deps.whiteboardGetter();
      return describeWhiteboardSnapshot(json);
    },
  };
}
