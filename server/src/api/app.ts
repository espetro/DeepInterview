import { existsSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import type { Config } from "@di/shared";
import type { Db } from "../store/db";
import { apiRoutes } from "./routes";
import { embeddingsClientFromConfig } from "../rag/ingest";
import type { Supervisor } from "../supervisor/supervisor";

export interface AppDeps {
  config: Config;
  db: Db;
  supervisor?: Supervisor;
  testMode: boolean;
  /** Embedded web UI assets; omitted in dev when web/ is served separately. */
  webAssets?: { root: string; path: string };
}

export async function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.route(
    "/v1",
    apiRoutes(deps.db, {
      testMode: deps.testMode,
      livekit: deps.config.livekit,
      embeddings: embeddingsClientFromConfig(deps.config.embeddings),
    }),
  );

  app.get("/v1/openapi.json", (c) => c.json(openApiSpec(deps.config)));

  app.get("/api/health", async (c) => {
    const children = deps.supervisor ? await deps.supervisor.health() : {};
    return c.json({ ok: true, children, testMode: deps.testMode });
  });

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
    info: { title: "deep-interview API", version: "0.1.0" },
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
      "/v1/token": {
        post: { summary: "Mint a LiveKit token", responses: { "501": { description: "Not implemented" } } },
      },
    },
  };
}

export function serveApp(app: Hono, port: number): ReturnType<Bun.serve> {
  return Bun.serve({ port, fetch: app.fetch });
}
