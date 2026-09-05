/**
 * Service worker: boots sqlite-wasm on the OPFS sahpool VFS, migrates the
 * schema, mounts @di/server's apiRoutes under /v1 and hands the app to
 * hono/service-worker's fire() so fetch events answer API requests.
 *
 * All deps resolve via ../../server and ../../shared relative imports, so no
 * workspace linking is needed; hono/valibot/kysely come from this package's
 * own node_modules (except hono/valibot: singletons resolved by bundlers).
 */
import { Hono } from "hono";
import { apiRoutes } from "../../server/src/api/routes";
import { createDatabase, migrate } from "./db-opfs";

const t0 = performance.now();
const db = await createDatabase("di.db");
await migrate(db);
const t1 = performance.now();
console.info(`[sw-api] db ready + migrated in ${(t1 - t0).toFixed(0)}ms`);

const app = new Hono();
app.route(
  "/v1",
  apiRoutes(db, {
    testMode: false,
    livekit: { url: "wss://localhost", api_key: "", api_secret: "" },
  }),
);

self.addEventListener("message", (e) => {
  (e as ExtendableMessageEvent).source?.postMessage({
    pong: true,
    data: e.data,
  });
});

addEventListener("fetch", (evt: FetchEvent) => {
  const url = new URL(evt.request.url);
  if (url.origin !== location.origin) return;
  console.info(`[sw-api] fetch ${evt.request.method} ${url.pathname}`);
  evt.respondWith(
    (async () => {
      try {
        return await app.request(evt.request);
      } catch (err) {
        console.error("[sw-api] handler error", err);
        return new Response(`sw-api error: ${err}`, { status: 500 });
      }
    })(),
  );
});

self.addEventListener("install", () => {
  void (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});
self.addEventListener("activate", (e: ExtendableEvent) => {
  e.waitUntil((self as unknown as ServiceWorkerGlobalScope).clients.claim());
});
