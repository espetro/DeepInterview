import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useStore } from "@nanostores/react";
import { $draft } from "../stores/session";
import { createSession } from "../lib/api";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "setup — di" }] }),
  component: Setup,
});

const PRESETS = [
  { label: "sys design", prompt: "Run a system design interview. Focus on scaling, caching and tradeoff reasoning." },
  { label: "behavioral", prompt: "Run a behavioral interview using the STAR method. Probe for specifics." },
  { label: "frontend", prompt: "Run a frontend interview. Mix of component design and JS fundamentals." },
  { label: "ML", prompt: "Run a machine learning interview. Model choice, evaluation, and data hygiene." },
];

const DURATIONS = [20, 30, 45, 60];

function Setup() {
  const draft = useStore($draft);
  const navigate = useNavigate();

  async function start(validate: boolean) {
    const session = await createSession({
      title: draft.title || PRESETS.find((p) => draft.prompt === p.prompt)?.label || "practice session",
      mode: draft.mode,
      duration_min: draft.durationMin,
    });
    navigate({ to: validate ? "/validate/$id" : "/interview/$id", params: { id: session.id } });
  }

  return (
    <div className="ambient grain min-h-[100dvh] bg-cream">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-8 md:px-8">
        <a href="/" className="font-display text-xl font-bold tracking-tight">di<span className="text-persimmon">.</span></a>
        <h1 className="text-sm font-normal text-espresso-soft">configure interview</h1>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 md:px-8">
        <div className="rounded-shell bg-paper p-2 ring-1 ring-hairline">
          <div className="rounded-[calc(2rem-0.375rem)] bg-cream p-6 md:p-10">
            <section className="rise-in" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">presets</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => $draft.set({ ...draft, prompt: p.prompt, title: p.label })}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                      draft.prompt === p.prompt
                        ? "bg-persimmon text-cream"
                        : "bg-white text-espresso-soft ring-1 ring-hairline hover:ring-persimmon/40"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rise-in mt-8" style={{ "--rise-delay": "120ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">custom prompt</h2>
              <textarea
                value={draft.prompt}
                onChange={(e) => $draft.set({ ...draft, prompt: e.target.value })}
                placeholder="paste a job description, your resume context, or anything the agent should know…"
                rows={4}
                className="mt-3 w-full resize-none rounded-card bg-white p-4 text-sm ring-1 ring-hairline outline-none transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
              />
            </section>

            <section className="rise-in mt-8" style={{ "--rise-delay": "240ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">
                files <span className="normal-case tracking-normal text-espresso-soft">· text-only: pdf md txt docx — 10 files / 20MB max</span>
              </h2>
              <div className="mt-3 rounded-card border border-dashed border-espresso-faint/40 bg-white/60 p-8 text-center text-sm text-espresso-soft transition-fluid hover:border-persimmon/50 hover:text-espresso-soft">
                drop files or click to browse
              </div>
            </section>

            <section className="rise-in mt-8 grid gap-6 md:grid-cols-2" style={{ "--rise-delay": "360ms" } as React.CSSProperties}>
              <div>
                <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">duration</h2>
                <div className="mt-3 flex gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => $draft.set({ ...draft, durationMin: d })}
                      className={`flex-1 rounded-full py-2 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                        draft.durationMin === d ? "bg-espresso text-cream" : "bg-white ring-1 ring-hairline text-espresso-soft"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">mode</h2>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => $draft.set({ ...draft, mode: "interview" })}
                    className={`flex-1 rounded-full py-2 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                      draft.mode === "interview" ? "bg-espresso text-cream" : "bg-white ring-1 ring-hairline text-espresso-soft"
                    }`}
                  >
                    interview
                  </button>
                  <span title="available after your first report" aria-disabled className="flex-1 cursor-not-allowed rounded-full bg-white/50 py-2 text-center text-sm font-medium text-espresso-soft ring-1 ring-hairline animate-pulse">
                    coach
                  </span>
                </div>
              </div>
            </section>

            <section className="rise-in mt-10 flex flex-col items-center gap-3" style={{ "--rise-delay": "480ms" } as React.CSSProperties}>
              <button
                onClick={() => void start(true)}
                className="group inline-flex items-center gap-3 rounded-full bg-espresso px-8 py-4 font-display text-lg font-semibold text-cream transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.98]"
              >
                validate & start
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream/15 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:scale-105">→</span>
              </button>
              <button
                onClick={() => void start(false)}
                className="text-sm text-espresso-soft underline decoration-hairline underline-offset-4 transition-fluid hover:text-persimmon"
              >
                proceed without validation
              </button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
