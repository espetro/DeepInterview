import { describe, it, expect } from "vitest";
import { OpenAiChatClient, type ToolDef } from "./llm.ts";

function fetchStub(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return handler as unknown as typeof fetch;
}

const tools: ToolDef[] = [
  {
    name: "update_question",
    description: "Rewrite the current question",
    parameters: { type: "object", properties: { question: { type: "string" } } },
  },
];

describe("OpenAiChatClient.chat", () => {
  it("posts the OpenAI request shape and parses content", async () => {
    let captured: { url: string; body: any; headers: Record<string, string> } | undefined;
    const llm = new OpenAiChatClient({
      baseUrl: "http://fake.local/",
      model: "mock-llm",
      apiKey: "sk-test",
      fetchImpl: fetchStub((url, init) => {
        captured = { url, body: JSON.parse(String(init!.body)), headers: init!.headers as Record<string, string> };
        return Response.json({
          choices: [{ message: { role: "assistant", content: "Tell me about maps." }, finish_reason: "stop" }],
        });
      }),
    });
    const result = await llm.chat([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]);
    expect(result.content).toBe("Tell me about maps.");
    expect(result.toolCalls).toEqual([]);
    expect(captured!.url).toBe("http://fake.local/v1/chat/completions");
    expect(captured!.body).toEqual({
      model: "mock-llm",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
    });
    expect(captured!.headers.authorization).toBe("Bearer sk-test");
  });

  it("sends tool defs wrapped as {type:'function'} and parses tool calls", async () => {
    let captured: any;
    const llm = new OpenAiChatClient({
      baseUrl: "http://fake.local",
      model: "mock-llm",
      fetchImpl: fetchStub((_url, init) => {
        captured = JSON.parse(String(init!.body));
        return Response.json({
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "update_question", arguments: '{"question":"Q2?"}' },
                  },
                ],
              },
            },
          ],
        });
      }),
    });
    const result = await llm.chat([{ role: "user", content: "next" }], tools);
    expect(captured.tools).toEqual([
      {
        type: "function",
        function: {
          name: "update_question",
          description: "Rewrite the current question",
          parameters: { type: "object", properties: { question: { type: "string" } } },
        },
      },
    ]);
    expect(result.toolCalls).toEqual([{ name: "update_question", args: { question: "Q2?" } }]);
  });

  it("omits the tools key when no tools are given, tolerates unparseable args", async () => {
    let captured: any;
    const llm = new OpenAiChatClient({
      baseUrl: "http://fake.local",
      model: "mock-llm",
      fetchImpl: fetchStub((_url, init) => {
        captured = JSON.parse(String(init!.body));
        return Response.json({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "not-json{" } }],
              },
            },
          ],
        });
      }),
    });
    const result = await llm.chat([{ role: "user", content: "hi" }]);
    expect(captured.tools).toBeUndefined();
    expect(result.toolCalls[0]!.args).toEqual({ _raw: "not-json{" });
  });

  it("emits llm.request/llm.result events and throws on error status", async () => {
    const events: { type: string; payload?: unknown }[] = [];
    const sink = { postEvent: async (_s: string, type: string, payload?: unknown) => void events.push({ type, payload }) };
    const ok = new OpenAiChatClient({
      baseUrl: "http://fake.local",
      model: "m",
      fetchImpl: fetchStub(() => Response.json({ choices: [{ message: { content: "hey" } }] })),
      events: sink,
      sessionId: "s1",
    });
    await ok.chat([{ role: "user", content: "x" }], tools);
    expect(events.map((e) => e.type)).toEqual(["llm.request", "llm.result"]);
    expect(events[0]!.payload).toEqual({ message_count: 1, tool_count: 1 });
    expect(events[1]!.payload).toMatchObject({ text_length: 3, tool_calls: 0 });

    events.length = 0;
    const failing = new OpenAiChatClient({
      baseUrl: "http://fake.local",
      model: "m",
      fetchImpl: fetchStub(() => new Response("err", { status: 429 })),
      events: sink,
      sessionId: "s1",
    });
    await expect(failing.chat([{ role: "user", content: "x" }])).rejects.toThrow(/429/);
    expect(events.map((e) => e.type)).toEqual(["llm.request", "llm.failed"]);
  });
});
