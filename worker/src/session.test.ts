import { describe, it, expect } from "vitest";
import { DiApiClient } from "./session.ts";
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

describe("DiApiClient", () => {
  it("posts turns matching the shared Turn schema", async () => {
    const bodies: unknown[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        bodies.push({ url: new URL(req.url).pathname, body: await req.json() });
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    try {
      const api = new DiApiClient({ baseUrl: `http://localhost:${server.port}` });
      const sessionId = crypto.randomUUID();
      const turn = makeTurn(0);
      await api.postTurn(sessionId, turn);
      expect(bodies).toHaveLength(1);
      const recorded = bodies[0]! as { url: string; body: typeof turn };
      expect(recorded.url).toBe(`/v1/sessions/${sessionId}/turns`);
      expect(recorded.body).toEqual(turn);
    } finally {
      server.stop(true);
    }
  });

  it("posts events matching the shared SessionEvent schema", async () => {
    const bodies: unknown[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        bodies.push({ url: new URL(req.url).pathname, body: await req.json() });
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    try {
      const api = new DiApiClient({ baseUrl: `http://localhost:${server.port}` });
      const sessionId = crypto.randomUUID();
      const at = new Date().toISOString();
      await api.postEvent(sessionId, "question.updated", { question: "Why?" }, at);
      expect(bodies).toHaveLength(1);
      const recorded = bodies[0]! as {
        url: string;
        body: { session_id: string; type: string; payload: unknown; at: string };
      };
      expect(recorded.url).toBe(`/v1/sessions/${sessionId}/events`);
      expect(recorded.body.session_id).toBe(sessionId);
      expect(recorded.body.type).toBe("question.updated");
      expect(recorded.body.payload).toEqual({ question: "Why?" });
      expect(recorded.body.at).toBe(at);
    } finally {
      server.stop(true);
    }
  });

  it("fetches tool state (empty and populated)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname.endsWith("/tools")
          ? Response.json({ editor: "code", whiteboard: "{}" })
          : new Response("nope", { status: 404 }),
    });
    try {
      const api = new DiApiClient({ baseUrl: `http://localhost:${server.port}` });
      const id = crypto.randomUUID();
      expect(await api.getToolState(id)).toEqual({ editor: "code", whiteboard: "{}" });
    } finally {
      server.stop(true);
    }

    const missing = Bun.serve({
      port: 0,
      fetch: () => new Response("nope", { status: 404 }),
    });
    try {
      const api = new DiApiClient({ baseUrl: `http://localhost:${missing.port}` });
      await expect(api.getToolState(crypto.randomUUID())).rejects.toThrow(/404/);
    } finally {
      missing.stop(true);
    }
  });

  it("throws on non-2xx responses", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("boom", { status: 500 }),
    });
    try {
      const api = new DiApiClient({ baseUrl: `http://localhost:${server.port}` });
      await expect(api.postTurn(crypto.randomUUID(), makeTurn(1))).rejects.toThrow(/500/);
    } finally {
      server.stop(true);
    }
  });
});
