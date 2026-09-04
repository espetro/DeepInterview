import type { EventSink } from "./stt/whisper-stt.ts";
import { providerUrl } from "./provider-url.ts";

/** OpenAI function-tool definition (name/description/parameters JSON schema). */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
}

export interface LlmResult {
  content: string;
  toolCalls: { name: string; args: Record<string, unknown> }[];
}

export interface OpenAiChatOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
  /** When set, emit llm.request/llm.result pipeline events. */
  events?: EventSink;
  sessionId?: string;
}

/**
 * Thin OpenAI-compatible chat completions client.
 *
 * Providers `openai` and `mock` speak the protocol natively; `anthropic`
 * rides an OpenAI-compatible gateway (e.g. Bifrost) at the configured
 * base_url, so the same request shape is used for all providers.
 */
export class OpenAiChatClient {
  constructor(private opts: OpenAiChatOptions) {}

  async chat(
    messages: LlmMessage[],
    tools?: ToolDef[],
    opts?: { signal?: AbortSignal },
  ): Promise<LlmResult> {
    const { events, sessionId } = this.opts;
    events
      ?.postEvent(sessionId!, "llm.request", {
        message_count: messages.length,
        tool_count: tools?.length ?? 0,
      })
      .catch((err) => console.warn(`[voice] failed to log llm.request: ${err}`));
    const startedAt = Date.now();

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) {
      headers.authorization = `Bearer ${this.opts.apiKey}`;
    }
    const res = await (this.opts.fetchImpl ?? fetch)(
      `${providerUrl(this.opts.baseUrl)}/v1/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.opts.model,
          messages,
          ...(tools && tools.length > 0
            ? { tools: tools.map((t) => ({ type: "function", function: t })) }
            : {}),
        }),
        signal: opts?.signal,
      },
    );
    const latency_ms = Date.now() - startedAt;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      events
        ?.postEvent(sessionId!, "llm.failed", { status: res.status, body, latency_ms })
        .catch(() => undefined);
      throw new Error(`llm chat failed: ${res.status} ${body}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    };
    const message = json.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      args: parseToolArgs(tc.function.arguments),
    }));
    const content = message?.content ?? "";
    events
      ?.postEvent(sessionId!, "llm.result", {
        text_length: content.length,
        tool_calls: toolCalls.length,
        latency_ms,
      })
      .catch(() => undefined);
    return { content, toolCalls };
  }
}

function parseToolArgs(raw: string): Record<string, unknown> {
  if (raw === undefined || raw === "") return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}
