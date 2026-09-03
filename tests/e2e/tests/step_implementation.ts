import { expect } from "expect";
import { request } from "@playwright/test";
import { step } from "@getgauge/ts";

const diUrl = process.env.DI_URL ?? "http://localhost:3000";

let api: Awaited<ReturnType<typeof request.newContext>> | undefined;
let sessionId = "";

step("open the di url", async () => {
  api = await request.newContext({ baseURL: diUrl });
});

step("create a session via the api", async () => {
  const res = await api!.post("/v1/sessions", {
    data: { title: "e2e text", mode: "interview", duration_min: 15 },
  });
  expect(res.status()).toBe(201);
  sessionId = (await res.json()).id;
});

step("assert test mode is on", async () => {
  const res = await api!.get("/v1/test/ping");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ testMode: true });
});

step("assert the session appears in server state", async () => {
  const res = await api!.get("/v1/test/state");
  expect(res.status()).toBe(200);
  const state = await res.json();
  const ids: string[] = state.sessions.map((s: { id: string }) => s.id);
  expect(ids).toContain(sessionId);
});
