import { Hono } from "hono";
import type { Db } from "../store/db";

/**
 * Debug routes, mounted only when DI_TEST_MODE=1.
 * Agents drive the app by URL and assert against these endpoints instead of DOM scraping.
 */
export function testRoutes(db: Db): Hono {
  const t = new Hono();

  // Serialized server state (sessions, reports) for fetch-based assertions.
  t.get("/state", async (c) => {
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    const reports = await db.selectFrom("reports").selectAll().execute();
    return c.json({
      sessions,
      reports: reports.map((r) => ({ session_id: r.session_id, data: JSON.parse(r.data) })),
    });
  });

  // Session event log (worker lifecycle, agent turns) for assertions.
  t.get("/events", async (c) => {
    const sessionId = c.req.query("session_id");
    let q = db.selectFrom("events").selectAll().orderBy("id");
    if (sessionId) q = q.where("session_id", "=", sessionId);
    const events = await q.execute();
    return c.json(
      events.map((e) => ({
        session_id: e.session_id,
        type: e.type,
        payload: e.payload === null ? undefined : JSON.parse(e.payload),
        at: e.at,
      })),
    );
  });

  // Probe that test mode is actually on; inert binary 404s this route.
  t.get("/ping", (c) => c.json({ testMode: true }));

  return t;
}
