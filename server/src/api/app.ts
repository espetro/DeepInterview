import { existsSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import type { Config } from "@di/shared";
import type { Db } from "../store/db";
import { apiRoutes } from "./routes";
import { embeddingsClientFromConfig } from "../rag/ingest";
import { tryUpgradeVoice, voiceWebSocketHandler, type VoiceDeps } from "../voice/ws";

export interface AppDeps {
  config: Config;
  db: Db;
  testMode: boolean;
  /** Embedded web UI assets; omitted in dev when web/ is served separately. */
  webAssets?: { root: string; path: string };
  /** Test injection for the voice WS loop (stub STT/TTS/LLM). */
  voiceDeps?: Pick<VoiceDeps, "loopFactory">;
}

export async function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.route(
    "/v1",
    apiRoutes(deps.db, {
      testMode: deps.testMode,
      embeddings: embeddingsClientFromConfig(deps.config.embeddings),
    }),
  );

  app.get("/v1/openapi.json", (c) => c.json(openApiSpec(deps.config)));

  app.get("/api/health", (c) => c.json({ ok: true, testMode: deps.testMode }));

  if (deps.webAssets) {
    const { serveStatic } = await import("@hono/node-server/serve-static");
    app.use("*", serveStatic({ root: deps.webAssets.root, rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p) }));
    // SPA fallback: any non-API GET serves the shell so deep links work.
    app.get("*", (c) => {
      const url = new URL(c.req.url);
      if (url.pathname.startsWith("/v1") || url.pathname.startsWith("/api")) return c.next();
      return c.html(readFileSync(`${deps.webAssets!.root}/index.html`, "utf8"));
    });
  }

  app.notFound((c) => c.json({ error: "not found" }, 404));

  return app;
}

function openApiSpec(config: Config): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: { title: "di API", version: "0.1.0" },
    servers: [{ url: `http://localhost:${config.server.port}` }],
    paths: {
      "/v1/sessions": {
        post: { summary: "Create an interview session", responses: { "201": { description: "Created" } } },
        get: { summary: "List sessions", responses: { "200": { description: "OK" } } },
      },
      "/v1/sessions/{id}": {
        get: {
          summary: "Get a session",
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
        },
      },
      "/v1/sessions/{id}/turns": {
        post: { summary: "Append a transcript turn", responses: { "201": { description: "Created" } } },
        get: { summary: "List turns", responses: { "200": { description: "OK" } } },
      },
      "/v1/sessions/{id}/events": {
        post: { summary: "Append a session event", responses: { "201": { description: "Created" } } },
      },
      "/v1/sessions/{id}/report": {
        put: { summary: "Store the report", responses: { "200": { description: "OK" } } },
        get: {
          summary: "Get the report",
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
        },
      },
    },
  };
}

/**
 * Serve the app on Bun with the voice WebSocket endpoint. Bun does not speak
 * Hono's upgradeWebSocket adapter, so /v1/sessions/:id/voice is upgraded
 * directly via server.upgrade() before falling through to app.fetch.
 */
export function serveApp(
  app: Hono,
  port: number,
  deps: { config: Config; db: Db; voiceDeps?: Pick<VoiceDeps, "loopFactory"> },
): ReturnType<typeof Bun.serve> {
  const ws = voiceWebSocketHandler({
    config: deps.config,
    db: deps.db,
    loopFactory: deps.voiceDeps?.loopFactory,
  });
  return Bun.serve({
    port,
    websocket: ws as never,
    fetch: async (req, server) => {
      const upgraded = await tryUpgradeVoice(req, server as UpgradeServer, deps.db);
      return upgraded ?? app.fetch(req);
    },
  });
}

interface UpgradeServer {
  upgrade: (req: Request, opts: { data: unknown }) => boolean;
}
