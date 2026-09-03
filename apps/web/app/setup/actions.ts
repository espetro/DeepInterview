"use server";

import type { PrepRequest } from "@deepinterview/shared";
import { requestPrep } from "@/lib/api";

export type StartSessionResult =
  | { ok: true; session_id: string }
  | { ok: false; error: string; reason?: "auth_required" };

/**
 * Kick off the prep pipeline and return the new session id. We return
 * `{session_id}` (rather than redirect()) so the client owns navigation via
 * router.push — this also keeps the Next 15 redirect-in-action pitfall out of
 * the picture.
 *
 * OSS is self-host, bring-your-own-keys, and UNCAPPED: there is no billing and
 * no per-tier interview limit. No auth: the session id is the capability.
 */
/**
 * Kick off the fast prep path (`POST /api/prep?fast=true`): facts are ingested
 * into the KB and the session is marked `ready` immediately — no LLM prep
 * graph — so the client can navigate straight to `/session/{id}`.
 */
export async function startSession(
  input: PrepRequest,
): Promise<StartSessionResult> {
  try {
    const { session_id } = await requestPrep(input, { fast: true });
    return { ok: true, session_id };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not reach the prep service.";
    return { ok: false, error: message };
  }
}
