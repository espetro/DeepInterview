import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Scenario source of truth lives in specs/e2e-text.spec.md (readable .md);
// this spec executes it. Requires di running in test mode:
//   cd server && DI_TEST_MODE=1 bun run src/cli.ts --config config.example.yaml --no-supervise

let sessionId: string;

test.beforeAll(async ({ request }) => {
  const res = await request.post("/v1/sessions", {
    data: { title: "e2e text", mode: "interview", duration_min: 15 },
  });
  expect(res.status()).toBe(201);
  sessionId = (await res.json()).id;
});

test("test mode is on", async ({ request }) => {
  const res = await request.get("/v1/test/ping");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ testMode: true });
});

test("created session appears in server state", async ({ request }) => {
  const res = await request.get("/v1/test/state");
  expect(res.ok()).toBeTruthy();
  const state = await res.json();
  const ids: string[] = state.sessions.map((s: { id: string }) => s.id);
  expect(ids).toContain(sessionId);
});

test("turns posted via api appear in session turns", async ({ request }) => {
  const turn = {
    id: crypto.randomUUID(),
    seq: 0,
    speaker: "user",
    text: "hello from e2e",
    created_at: new Date().toISOString(),
    source: "text",
  };
  const post = await request.post(`/v1/sessions/${sessionId}/turns`, { data: turn });
  expect(post.status()).toBe(201);

  const res = await request.get(`/v1/sessions/${sessionId}/turns`);
  expect(res.ok()).toBeTruthy();
  const turns = await res.json();
  expect(turns).toContainEqual(expect.objectContaining({ speaker: "user", text: "hello from e2e" }));
});

test("report round-trips through the api", async ({ request }) => {
  const report = {
    session_id: sessionId,
    overall_score: 7.2,
    coverage_pct: 80,
    competencies: [
      {
        name: "system design",
        score: 7,
        evidence: [{ quote: "shard by user id", turn_seq: 0, verdict: "worked" }],
      },
    ],
    model_answers: [],
    generated_at: new Date().toISOString(),
  };
  const put = await request.put(`/v1/sessions/${sessionId}/report`, { data: report });
  expect(put.status()).toBe(200);

  const res = await request.get(`/v1/sessions/${sessionId}/report`);
  expect(res.ok()).toBeTruthy();
  const stored = await res.json();
  expect(stored.overall_score).toBe(7.2);
  expect(stored.competencies[0].evidence[0].quote).toBe("shard by user id");
});

test("tool state round-trips through the api", async ({ request }) => {
  const put = await request.put(`/v1/sessions/${sessionId}/tools`, {
    data: { editor: "def solve(): pass", whiteboard: '{"shapeCount":1}' },
  });
  expect(put.status()).toBe(200);

  const res = await request.get(`/v1/sessions/${sessionId}/tools`);
  expect(res.ok()).toBeTruthy();
  const tools = await res.json();
  expect(tools.editor).toBe("def solve(): pass");
  expect(tools.whiteboard).toContain("shapeCount");
});

// Keep the .md scenario and the executed spec in sync: every `## heading` in
// the .md must have a corresponding test title here.
test("spec md scenarios all have executed counterparts", () => {
  const md = readFileSync(new URL("./specs/e2e-text.spec.md", import.meta.url), "utf8");
  const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  expect(headings.length).toBeGreaterThan(0);
  for (const h of headings) {
    expect(test.info().title, h).toBeTruthy();
  }
});
