import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
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
    listeners: Record<string, ((ev: unknown) => void)[]> = {};

    constructor(_opts: unknown) {
      sessionBox.current = this;
    }

    on(event: string, cb: (ev: unknown) => void) {
      (this.listeners[event] ??= []).push(cb);
      return this;
    }

    /** Fire every listener registered for `event`, as the real SDK would. */
    emit(event: string, ev: unknown) {
      for (const cb of this.listeners[event] ?? []) cb(ev);
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
  listeners: Record<string, ((ev: unknown) => void)[]>;
  emit: (event: string, ev: unknown) => void;
};

import { runJob } from "./entry.ts";
import { VAD as MockedVad } from "@livekit/agents-plugin-silero";
import { resetWorkerConfigCacheForTests } from "./config.ts";
import fc from "fast-check";

describe("runJob RoomIO wiring", () => {
  beforeEach(() => {
    resetWorkerConfigCacheForTests();
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

// Property coverage for the seq-monotonicity guard in the
// conversation_item_added handler: session.on("conversation_item_added")
// fires once per turn, but nothing prevents the real SDK from emitting
// several in a burst before the first turn's postTurn() call resolves. The
// handler chains a `seqLock` promise specifically to keep seq strictly
// increasing under that interleaving; this test races real Promise/timer
// scheduling (not just call order) to try to break it.
describe("runJob turn seq monotonicity under concurrent item arrivals", () => {
  // One fake DI server, reused across every fc run: repeatedly creating and
  // force-stopping Bun.serve() in a tight loop is flaky (a freshly bound
  // port intermittently refuses the very next connection), which has
  // nothing to do with the property under test. State is keyed by
  // session id (path segment) rather than shared mutable variables, so a
  // slow request from one fc run can't read another run's state (Bun/undici
  // may keep the keep-alive connection open and interleave requests across
  // "runs" that share the same event loop).
  const runState = new Map<string, { existingTurnCount: number; postedSeqs: number[] }>();
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.pathname.split("/")[3]; // "" / v1 / sessions / :id / ...
      const state = runState.get(sessionId ?? "");
      if (url.pathname.endsWith("/context")) return Response.json({ chunks: [] });
      if (url.pathname.endsWith("/turns") && req.method === "GET") {
        // getTurns() valibot-parses each row as a full Turn; a shape that
        // fails to parse throws inside .then(), which entry.ts's
        // .catch(() => 0) silently swallows back down to 0 — so these
        // stand-ins must be schema-valid, not just array padding.
        return Response.json(
          Array.from({ length: state?.existingTurnCount ?? 0 }, (_, i) => ({
            id: crypto.randomUUID(),
            session_id: sessionId,
            seq: i,
            speaker: "user",
            text: "prior turn",
            created_at: new Date().toISOString(),
            source: "voice",
          })),
        );
      }
      if (url.pathname.endsWith("/turns") && req.method === "POST") {
        const body = (await req.json()) as { seq: number };
        state?.postedSeqs.push(body.seq);
        return Response.json({}, { status: 201 });
      }
      return new Response("{}", { headers: { "content-type": "application/json" } });
    },
  });

  afterAll(() => {
    server.stop(true);
  });

  beforeEach(() => {
    resetWorkerConfigCacheForTests();
    sessionBox.current = undefined;
    process.env.DI_API_BASE = `http://localhost:${server.port}`;
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

  it("keeps posted seqs strictly increasing regardless of item-arrival interleaving", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 7 }), // turns already persisted before this job started
        // per-arriving-item random delay (ms) before its role/text is even known to the
        // handler, simulating the real SDK's unpredictable event timing
        fc.array(fc.record({ delayMs: fc.integer({ min: 0, max: 5 }), isUser: fc.boolean() }), {
          minLength: 2,
          maxLength: 8,
        }),
        async (turnCount, items) => {
          sessionBox.current = undefined;
          const sessionId = crypto.randomUUID();
          const postedSeqs: number[] = [];
          runState.set(sessionId, { existingTurnCount: turnCount, postedSeqs });

          const fakeRoom = {
            name: `interview-${sessionId}`,
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
          const session = sessionBox.current!;

          // Fire all items "concurrently": each handler invocation is
          // scheduled on a random-length timer, so real Bun event-loop
          // ordering (not just the order we call emit() in) decides which
          // conversation_item_added callback's async body runs first.
          await Promise.all(
            items.map(
              (item, i) =>
                new Promise<void>((resolve) => {
                  setTimeout(() => {
                    session.emit("conversation_item_added", {
                      item: {
                        role: item.isUser ? "user" : "assistant",
                        textContent: `item-${i}`,
                      },
                    });
                    resolve();
                  }, item.delayMs);
                }),
            ),
          );
          // seqLock chains onto itself per-emit, but the chain's tail promise
          // isn't observable from here; poll until every item has posted.
          await vi.waitFor(() => expect(postedSeqs).toHaveLength(items.length), { timeout: 1000 });

          for (let i = 1; i < postedSeqs.length; i++) {
            expect(postedSeqs[i]).toBeGreaterThan(postedSeqs[i - 1]!);
          }
          expect(new Set(postedSeqs).size).toBe(postedSeqs.length);
          expect(postedSeqs[0]).toBe(turnCount);
          runState.delete(sessionId);
        },
      ),
      { numRuns: 8 },
    );
  }, 20000);
});
