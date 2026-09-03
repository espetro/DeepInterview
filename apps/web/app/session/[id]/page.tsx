import { PrepSummary } from "@/components/session/prep-summary";

// Page-level auth + a per-request agent poll downstream; never prerender.
export const dynamic = "force-dynamic";

/**
 * Prep screen shell (the step BETWEEN setup and the live interview). Server
 * component: hands the session id + chosen persona to the
 * `<PrepSummary>` client poller, which shows the agents working and then the
 * "what we found" bento.
 *
 * Next 15: `params`/`searchParams` are Promises — await them. No auth gate: OSS
 * runs without sign-in (the unguessable session id is the capability).
 */
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ persona?: string }>;
}) {
  const { id } = await params;
  const { persona } = await searchParams;

  // No auth gate — OSS runs without sign-in (the setup → prep → interview →
  // report flow needs no login; hosted deployments add auth as a separate layer).
  return <PrepSummary sessionId={id} persona={persona ?? null} />;
}
