import { expect, test } from "@playwright/test";

// Same assertions as the Gauge spec in specs/e2e-text.spec, as a plain
// Playwright spec so the suite runs without the Gauge CLI installed.

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
