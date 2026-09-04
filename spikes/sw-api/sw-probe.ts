import { Hono } from "hono";
import { fire } from "hono/service-worker";
const app = new Hono();
app.get("/v1/ping", (c) => c.json({ ok: true }));
fire(app);
