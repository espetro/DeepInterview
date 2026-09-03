import { createFileRoute } from "@tanstack/react-router";
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
  const { data: report, isLoading } = useQuery<ReportDto>({
    queryKey: ["report", id],
    queryFn: () => getReport(id) as Promise<ReportDto>,
  });

  if (isLoading || !report) {
    return (
      <div className="grain flex min-h-[100dvh] items-center justify-center bg-cream">
        <p className="font-display text-lg text-espresso-soft">scoring your session…</p>
      </div>
    );
  }

  return (
    <div className="grain min-h-[100dvh] bg-cream">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-8 md:px-8">
        <a href="/" className="font-display text-xl font-bold tracking-tight">di<span className="text-persimmon">.</span></a>
        <span className="text-sm text-espresso-soft">report: {session?.title}</span>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 md:px-8">
        {/* score bento */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-card bg-espresso p-6 text-cream">
            <p className="text-[10px] uppercase tracking-[0.2em] text-cream/60">overall</p>
            <p className="mt-2 font-display text-5xl font-extrabold">{report.overall_score}<span className="text-xl text-cream/60"> /10</span></p>
          </div>
          <div className="rounded-card bg-paper p-6 ring-1 ring-hairline">
            <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-faint">coverage</p>
            <p className="mt-2 font-display text-5xl font-extrabold">{report.coverage_pct}<span className="text-xl text-espresso-faint">%</span></p>
          </div>
          <div className="rounded-card bg-persimmon-faint p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-persimmon-deep">session</p>
            <p className="mt-2 font-display text-xl font-bold">{session?.mode} · {session?.duration_min} min</p>
          </div>
        </div>

        {/* competencies */}
        <h2 className="mt-12 text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-faint">competencies</h2>
        <div className="mt-4 space-y-4">
          {report.competencies.map((c) => (
            <div key={c.name} className="rounded-card bg-paper p-2 ring-1 ring-hairline">
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
                      <span className="text-xs text-espresso-faint">turn {e.turn_seq}</span>
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
            className="group inline-flex cursor-not-allowed items-center gap-3 rounded-full bg-white/60 px-7 py-3.5 font-display font-semibold text-espresso-faint ring-1 ring-hairline animate-pulse"
          >
            practice weak areas
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-espresso/5">→</span>
          </span>
        </div>
      </main>
    </div>
  );
}
