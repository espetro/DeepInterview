import { describe, it, expect } from "vitest";
import { DiApiClient } from "./session.ts";
import { postTurnWithRetry } from "./entry.ts";
import type { Turn } from "@di/shared";

function makeTurn(seq: number): Turn {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    seq,
    speaker: "user",
    text: "hello there",
    created_at: new Date().toISOString(),
    source: "voice",
  };
}

describe("postTurnWithRetry", () => {
  const sessionId = crypto.randomUUID();

  it("succeeds on the first attempt without retries", async () => {
    let calls = 0;
    const api = new DiApiClient({
      baseUrl: "http://test",
      fetchImpl: async () => {
        calls++;
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    const delays: number[] = [];
    await postTurnWithRetry(api, sessionId, makeTurn(0), delays.map(() => 0));
    expect(calls).toBe(1);
  });

  it("retries and succeeds when fetch fails then recovers", async () => {
    const posts: { path: string; body: unknown }[] = [];
    let calls = 0;
    const api = new DiApiClient({
      baseUrl: "http://test",
      fetchImpl: async (url, init) => {
        calls++;
        if (calls <= 2) throw new Error("boom");
        posts.push({
          path: new URL(String(url)).pathname,
          body: JSON.parse(String(init?.body)),
        });
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    const turn = makeTurn(0);
    await postTurnWithRetry(api, sessionId, turn, [0, 0]);
    expect(calls).toBe(3);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.path).toBe(`/v1/sessions/${sessionId}/turns`);
    expect(posts[0]!.body).toEqual(turn);
  });

  it("fails after 3 attempts and emits turn.persist_failed", async () => {
    const posts: { path: string; body: Record<string, unknown> }[] = [];
    let turnCalls = 0;
    let eventCalls = 0;
    const api = new DiApiClient({
      baseUrl: "http://test",
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        posts.push({ path, body });
        if (path.endsWith("/events")) {
          eventCalls++;
          return new Response("{}", { headers: { "content-type": "application/json" } });
        }
        turnCalls++;
        return new Response("boom", { status: 500 });
      },
    });
    const turn = makeTurn(2);
    await postTurnWithRetry(api, sessionId, turn, [0, 0]).catch((err) => {
      void api
        .postEvent(sessionId, "turn.persist_failed", { seq: turn.seq, error: String(err) })
        .catch(() => undefined);
    });
    expect(turnCalls).toBe(3);
    expect(eventCalls).toBe(1);
    const event = posts.find((p) => p.path.endsWith("/events"))!;
    expect(event.body.type).toBe("turn.persist_failed");
    expect(event.body.session_id).toBe(sessionId);
    expect(event.body.payload).toMatchObject({ seq: 2 });
    expect(String(event.body.payload && (event.body.payload as { error: string }).error)).toContain(
      "500",
    );
  });
});
