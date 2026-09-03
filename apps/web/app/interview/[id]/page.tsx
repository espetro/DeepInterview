import { notFound } from "next/navigation";
import { isLiveKitConfigured, serverEnv } from "@/lib/env";
import { createInterviewToken } from "@/lib/livekit";
import { getPersona } from "@/lib/personas";
import { SessionViewSchema, type SessionView } from "@/lib/session";
import { LiveRoom } from "@/components/interview/live-room";

// Reads server-only config and calls the agent API per request; never prerender.
export const dynamic = "force-dynamic";

/**
 * Live interview screen (WP-2). Server component.
 *
 * Next 15: `params`/`searchParams` are Promises — await them. No auth gate:
 * OSS runs with no sign-in, and the unguessable session id IS the capability.
 *
 * Token: minted server-side via `createInterviewToken` behind an
 * `isLiveKitConfigured()` guard, only after the session is verified to exist and
 * pinned to its own room (there is deliberately no general-purpose token
 * endpoint — a caller cannot mint a token for an arbitrary room or identity).
 * When LiveKit is NOT configured we pass `token=null` so `<LiveRoom>` renders in
 * preview (not-connected) mode — the offline path the build runs with no keys.
 *
 * Capability guard: before minting, the session must exist with the agent
 * (same auth-free read path the report page uses). The session id is an
 * unguessable `sess_<uuid4>` capability URL (OSS no-auth design) — knowing it
 * grants access, but we never mint LiveKit tokens for arbitrary room names.
 */

/**
 * Resolve the session from the agent (`GET /api/session/{id}`). Returns null
 * when the session is unknown, the body doesn't parse, or the agent is
 * unreachable — the token guard FAILS CLOSED (no verified session ⇒ no token).
 */
async function loadSession(id: string): Promise<SessionView | null> {
  try {
    const res = await fetch(
      `${serverEnv.agentApiUrl}/api/session/${encodeURIComponent(id)}`,
      { cache: "no-store", signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    const parsed = SessionViewSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duration?: string }>;
}) {
  const { id } = await params;
  const { duration: durationParam } = await searchParams;

  const identity = "dev-local";
  const name: string | undefined = undefined;

  // Mint a token only when LiveKit is configured; otherwise preview mode.
  let token: string | null = null;
  let url: string | null = null;
  if (isLiveKitConfigured()) {
    // The session id IS the capability: verify it exists with the agent before
    // minting, and pin the LiveKit room to exactly the verified session id —
    // never a client-supplied room name.
    const session = await loadSession(id);
    if (!session || session.session_id !== id) notFound();

    // Difficulty / voice / duration come from the persisted InterviewContext
    // (stamped at prep), not from query params.
    const context = session.context;
    const difficulty = context?.difficulty ?? undefined;

    // Duration: prefer duration_min from the session context; the legacy
    // `?duration=` query param still works as an override, clamped to [5, 60]
    // (the band PrepRequest allows).
    const parsedParam = Number.parseInt(durationParam ?? "", 10);
    const durationMin =
      context?.duration_min ??
      (Number.isFinite(parsedParam)
        ? Math.min(60, Math.max(5, parsedParam))
        : undefined);

    // Only mint a publish-capable token for a session that is still joinable.
    // A shared report/prep link points at the same id; without this a finished
    // (or errored) session's link would still open a live mic into the room.
    const JOINABLE = new Set(["prep", "ready"]);
    if (!JOINABLE.has(session.status)) {
      return (
        <LiveRoom
          sessionId={id}
          persona={getPersona(undefined)}
          token={null}
          url={null}
          previewReason="ended"
        />
      );
    }

    const room = session.session_id;
    const minted = await createInterviewToken({
      room,
      identity,
      name,
      metadata: {
        session_id: room,
        duration_min: durationMin,
        difficulty,
        // voice is nullable on InterviewContext (null -> worker picks default).
        voice: context?.voice ?? undefined,
      },
    });
    token = minted.token;
    url = minted.url;
  }

  return <LiveRoom sessionId={id} persona={getPersona(undefined)} token={token} url={url} />;
}
