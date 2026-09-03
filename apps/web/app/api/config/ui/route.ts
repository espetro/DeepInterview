import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

// Reads server-only config (AGENT_API_URL) and proxies a live agent call;
// never prerender / always run on the server per request.
export const dynamic = "force-dynamic";

/**
 * GET /api/config/ui — server-side proxy to the agent's
 * `GET ${AGENT_API_URL}/api/config/ui` (no auth upstream, none here).
 *
 * We proxy rather than call the agent from the browser so `AGENT_API_URL`
 * stays server-only (lib/setup-config.ts falls back to safe defaults on any
 * non-ok status, so a down agent never breaks the setup form).
 */
export async function GET() {
  try {
    const upstream = await fetch(`${serverEnv.agentApiUrl}/api/config/ui`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const json = await upstream.json().catch(() => null);
    if (json === null) return NextResponse.json({}, { status: 502 });
    return NextResponse.json(json, { status: upstream.status });
  } catch {
    return NextResponse.json({}, { status: 503 });
  }
}
