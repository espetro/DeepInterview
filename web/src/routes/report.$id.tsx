import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getReport, getSession } from "../lib/api";

export const Route = createFileRoute("/report/$id")({
  component: Report,
});

interface ReportDto {
  overall_score: number;
  coverage_pct: number;
  competencies: Array<{
    name: string;
    score: number;
    evidence: Array<{ quote: string; turn_seq: number; verdict: string }>;
  }>;
}

const VERDICT_TONE: Record<string, string> = {
  worked: "bg-sage/15 text-sage",
  improve: "bg-butter/20 text-[#9a7d1a]",
  drop: "bg-persimmon-soft text-persimmon-deep",
};

function Report() {
  const { id } = Route.useParams();
  const { data: session } = useQuery({ queryKey: ["session", id], queryFn: () => getSession(id) });
  const { data: report, isLoading, isError, refetch } = useQuery<ReportDto>({
    queryKey: ["report", id],
    queryFn: () => getReport(id) as Promise<ReportDto>,
    retry: 2,
    retryDelay: 1500,
  });

  if (isLoading) {
    return (
      <div className="ambient grain flex min-h-[100dvh] items-center justify-center bg-cream">
        <div className="text-center">
          <div className="orb-live mx-auto h-10 w-10 rounded-full bg-gradient-to-br from-persimmon to-persimmon-deep" aria-hidden="true" />
          <p className="rise-in mt-6 font-display text-lg text-espresso-soft">scoring your session…</p>
        </div>
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="ambient grain flex min-h-[100dvh] items-center justify-center bg-cream">
        <main className="rise-in w-full max-w-md text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">no report yet</p>
          <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight">the agent hasn’t scored this session</h1>
          <p className="mt-3 text-sm text-espresso-soft">
            report generation isn’t wired for this session yet — it lands in a later iteration. your transcript is safe.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              onClick={() => void refetch()}
              className="rounded-full bg-white px-6 py-3 text-sm font-medium ring-1 ring-hairline transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:ring-persimmon/50 active:scale-[0.97]"
            >
              try again
            </button>
            <Link
              to="/finish/$id"
              params={{ id }}
              className="text-sm text-espresso-soft underline decoration-hairline underline-offset-4 transition-fluid hover:text-persimmon"
            >
              back to transcript
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="ambient grain min-h-[100dvh] bg-cream">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-8 md:px-8">
        <a href="/" className="font-display text-xl font-bold tracking-tight">di<span className="text-persimmon">.</span></a>
        <span className="text-sm text-espresso-soft">report: {session?.title}</span>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 md:px-8">
        {/* score bento */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rise-in rounded-card bg-espresso p-6 text-cream">
            <p className="text-[10px] uppercase tracking-[0.2em] text-cream/60">overall</p>
            <p className="mt-2 font-display text-5xl font-extrabold tabular-nums">{report.overall_score}<span className="text-xl text-cream/60"> /10</span></p>
          </div>
          <div className="rise-in rounded-card bg-paper p-6 ring-1 ring-hairline" style={{ "--rise-delay": "120ms" } as React.CSSProperties}>
            <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">coverage</p>
            <p className="mt-2 font-display text-5xl font-extrabold">{report.coverage_pct}<span className="text-xl text-espresso-soft">%</span></p>
          </div>
          <div className="rise-in rounded-card bg-persimmon-faint p-6" style={{ "--rise-delay": "240ms" } as React.CSSProperties}>
            <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-persimmon-deep">session</p>
            <p className="mt-2 font-display text-xl font-bold">{session?.mode} · {session?.duration_min} min</p>
          </div>
        </div>

        {/* competencies */}
        <h2 className="mt-12 text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">competencies</h2>
        <div className="mt-4 space-y-4">
          {report.competencies.map((c, i) => (
            <div key={c.name} className="rise-in rounded-card bg-paper p-2 ring-1 ring-hairline" style={{ "--rise-delay": `${Math.min(i * 90, 450)}ms` } as React.CSSProperties}>
              <div className="rounded-[calc(1.5rem-0.375rem)] bg-cream p-5">
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold">{c.name}</span>
                  <span className="font-display text-lg font-bold text-persimmon">{c.score.toFixed(1)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-cream-deep">
                  <div className="h-2 rounded-full bg-persimmon transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ width: `${c.score * 10}%` }} />
                </div>
                <ul className="mt-4 space-y-2">
                  {c.evidence.map((e, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${VERDICT_TONE[e.verdict] ?? ""}`}>{e.verdict}</span>
                      <span className="text-espresso-soft">“{e.quote}”</span>
                      <span className="text-xs text-espresso-soft">turn {e.turn_seq}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <span
            title="available in a future iteration"
            aria-disabled
            className="group inline-flex cursor-not-allowed items-center gap-3 rounded-full bg-white/60 px-7 py-3.5 font-display font-semibold text-espresso-soft ring-1 ring-hairline animate-pulse"
          >
            practice weak areas
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-espresso/5">→</span>
          </span>
        </div>
      </main>
    </div>
  );
}
