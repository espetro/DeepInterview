import { createFileRoute, Link } from "@tanstack/react-router";
import { FormattedMessage } from "react-intl";

export const Route = createFileRoute("/")({
  component: Landing,
});

const STICKERS = [
  { text: "tell me about a time you failed.", rotate: "-rotate-3", tone: "bg-persimmon-soft", pos: "top-8 right-10" },
  { text: "system design · 45 min · hard", rotate: "rotate-2", tone: "bg-white", pos: "top-40 -left-2" },
  { text: "walk me through your resume.", rotate: "-rotate-2", tone: "bg-white", pos: "bottom-24 right-16" },
  { text: "why did you leave your last job?", rotate: "rotate-1", tone: "bg-persimmon-faint", pos: "top-64 right-40" },
  { text: "quick fire: 5 questions, 5 minutes.", rotate: "-rotate-1", tone: "bg-white", pos: "bottom-10 left-10" },
];

function Landing() {
  return (
    <div className="grain min-h-[100dvh] bg-cream">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-8 md:px-8">
        <Link to="/" className="font-display text-xl font-bold tracking-tight transition-fluid active:scale-[0.98]">
          di<span className="text-persimmon">.</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-espresso-soft">
          <Link to="/history" className="transition-fluid hover:text-espresso">history</Link>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="transition-fluid hover:text-espresso">github</a>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-32 pt-16 md:px-8 md:pt-28">
        <span className="inline-block rounded-full bg-espresso px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium text-cream">
          mock interviews
        </span>

        <h1 className="mt-8 max-w-3xl font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
          the AI agent you <span className="text-persimmon">practice</span> your interviews with.
        </h1>

        <p className="mt-6 max-w-md text-lg text-espresso-soft">
          voice interviews with an agent that actually pushes back. then get the receipts.
        </p>

        <div className="mt-12">
          <Link
            to="/setup"
            className="group inline-flex items-center gap-3 rounded-full bg-espresso px-7 py-4 font-display text-lg font-semibold text-cream transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.98]"
          >
            grill me
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream/15 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:scale-105">
              →
            </span>
          </Link>
        </div>

        {/* sticker / post-it field */}
        <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
          {STICKERS.map((s) => (
            <div
              key={s.text}
              className={`absolute ${s.pos} ${s.rotate} ${s.tone} w-52 rounded-card p-4 font-display text-sm font-medium leading-snug shadow-[0_20px_50px_-20px_rgba(43,33,24,0.25)] ring-1 ring-hairline transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:rotate-0 hover:scale-[1.03]`}
            >
              “{s.text}”
            </div>
          ))}
        </div>

        <p className="mt-20 text-xs uppercase tracking-[0.15em] text-espresso-faint">
          no signup · runs local · your audio never leaves the machine
        </p>
      </main>
    </div>
  );
}
