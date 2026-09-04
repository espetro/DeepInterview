import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobContext } from "@livekit/agents";

// Regression coverage for the RoomIO double-construction bug: entry.ts once
// built its own `RoomIO` alongside the one `AgentSession.start()` builds
// internally, and the second RoomIO silently stole `session.input.audio`
// after the session's forwarding loop had already latched onto the first
// one, so STT never received audio frames. AgentSession is faked here to
// assert the wiring directly: `session.start()` is the only thing that may
// touch `session.input.audio`, and it must be called exactly once.

// vi.mock factories are hoisted above the rest of the module, so the fake
// classes and the box used to observe the constructed instance must be
// declared inside the factories themselves (no top-level references).
const sessionBox: { current: FakeAgentSessionType | undefined } = { current: undefined };

vi.mock("@livekit/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@livekit/agents")>();
  class FakeAgentSession {
    input: { audio: unknown } = { audio: null };
    startCalls: unknown[] = [];

    constructor(_opts: unknown) {
      sessionBox.current = this;
    }

    on(_event: string, _cb: (ev: unknown) => void) {
      return this;
    }

    async start(opts: { room: unknown; agent: unknown; inputOptions: unknown }) {
      this.startCalls.push(opts);
      // Simulate the SDK binding the room's audio input during start(): a
      // second RoomIO constructed after this resolves would overwrite it.
      this.input.audio = { boundBy: "start" };
    }

    async say(_text: string) {
      return;
    }

    async close() {
      return;
    }
  }
  return {
    ...actual,
    AgentSession: FakeAgentSession,
  };
});

vi.mock("@livekit/agents-plugin-silero", () => {
  class FakeVad {
    static async load() {
      return new FakeVad();
    }
  }
  return { VAD: FakeVad };
});

// `bun run --bun vitest run` (this project's test command, see mise.toml)
// cannot resolve zod's real conditional export map in this environment
// (`z.object` comes back undefined at runtime, independent of anything in
// this file — reproduces with a bare `import { z } from "zod"` too), and
// mocking relative-path modules like ./agent.ts isn't honored under the same
// runner. Stubbing the bare "zod" specifier sidesteps both: agent.ts's real
// tool() calls still run, just against a schema stub good enough to
// construct without crashing. What agent.ts does with those tools is
// unrelated to the session/room IO wiring this test covers.
vi.mock("zod", () => {
  const chain: Record<string, unknown> = {
    describe: () => chain,
    optional: () => chain,
  };
  const z = {
    object: () => chain,
    string: () => chain,
    array: () => chain,
  };
  return { z };
});

type FakeAgentSessionType = {
  input: { audio: unknown };
  startCalls: unknown[];
};

import { runJob } from "./entry.ts";
import { VAD as MockedVad } from "@livekit/agents-plugin-silero";

describe("runJob RoomIO wiring", () => {
  beforeEach(() => {
    sessionBox.current = undefined;
    process.env.DI_LIVEKIT__URL = "ws://localhost:7880";
    process.env.DI_LIVEKIT__API_KEY = "devkey";
    process.env.DI_LIVEKIT__API_SECRET = "secret";
    process.env.DI_LLM__PROVIDER = "mock";
    process.env.DI_LLM__BASE_URL = "http://localhost:8080/v1";
    process.env.DI_LLM__MODEL = "mock-model";
    process.env.DI_STT__BASE_URL = "http://localhost:8080";
    process.env.DI_STT__MODEL = "whisper-1";
    process.env.DI_TTS__BASE_URL = "http://localhost:8080";
    process.env.DI_TTS__MODEL = "pocket";
    process.env.DI_TTS__VOICE = "alloy";
  });

  it("wires session IO through a single AgentSession.start() call, never a manual RoomIO", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        const url = new URL(req.url);
        if (url.pathname.endsWith("/context")) {
          return Response.json({ chunks: [] });
        }
        if (url.pathname.endsWith("/turns")) {
          return Response.json([]);
        }
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    process.env.DI_API_BASE = `http://localhost:${server.port}`;

    try {
      const fakeRoom = {
        name: "interview-00000000-0000-0000-0000-000000000000",
        metadata: "",
        on: vi.fn(),
      };
      const ctx = {
        job: { room: { name: fakeRoom.name } },
        room: fakeRoom,
        connect: vi.fn(async () => undefined),
        addShutdownCallback: vi.fn(),
        proc: { userData: { vad: await MockedVad.load() } },
      } as unknown as JobContext;

      await runJob(ctx);

      expect(ctx.connect).toHaveBeenCalledTimes(1);
      expect(sessionBox.current).toBeDefined();
      expect(sessionBox.current!.startCalls).toHaveLength(1);
      const startOpts = sessionBox.current!.startCalls[0] as { room: unknown; inputOptions: unknown };
      expect(startOpts.room).toBe(fakeRoom);
      expect(startOpts.inputOptions).toEqual({ textEnabled: true, audioEnabled: true });
      // Exactly one thing bound session.input.audio, and it stayed bound:
      // no second RoomIO ran after start() to overwrite it.
      expect(sessionBox.current!.input.audio).toEqual({ boundBy: "start" });
    } finally {
      server.stop(true);
    }
  });
});
