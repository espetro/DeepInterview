import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSession, getTurns, type TurnDto } from "../lib/api";

function formatTimestamp(createdAt: string) {
  const d = new Date(createdAt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function transcriptToMarkdown(session: { title: string }, turns: TurnDto[]) {
  const lines = turns.map((t) => `**${t.speaker}** (${t.source}, ${formatTimestamp(t.created_at)}): ${t.text}`);
  return `# ${session.title}\n\n${lines.join("\n\n")}\n`;
}

function download(filename: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const Route = createFileRoute("/finish/$id")({
  component: Finish,
});

function Finish() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: session } = useQuery({ queryKey: ["session", id], queryFn: () => getSession(id) });
  const { data: turns } = useQuery({ queryKey: ["turns", id], queryFn: () => getTurns(id) });

  function downloadMarkdown() {
    if (!session) return;
    download(`transcript-${id}.md`, new Blob([transcriptToMarkdown(session, turns ?? [])], { type: "text/markdown" }));
  }

  function downloadJson() {
    setMenuOpen(false);
    download(`transcript-${id}.json`, new Blob([JSON.stringify(turns ?? [], null, 2)], { type: "application/json" }));
  }

  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <div className="ambient grain flex min-h-[100dvh] items-center justify-center bg-cream px-4">
      <main className="w-full max-w-md text-center">
        <div className="rise-in"><p className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">interview complete</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">{session?.title ?? "session"}</h1>
        <p className="mt-2 text-sm text-espresso-soft">{session?.duration_min} min · {turns?.length ?? 0} turns</p></div>

        <div className="mt-10 space-y-3">
          <div ref={menuRef} className="rise-in relative" style={{ "--rise-delay": "200ms" } as React.CSSProperties}>
            <button
              onClick={downloadMarkdown}
              className="w-full rounded-full bg-white px-6 py-3.5 font-display font-semibold ring-1 ring-hairline transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:ring-persimmon/50 active:scale-[0.98]"
            >
              get transcript
            </button>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="more transcript formats"
              aria-expanded={menuOpen}
              className="absolute right-1.5 top-1.5 flex h-[calc(100%-0.75rem)] w-10 items-center justify-center rounded-full text-espresso-soft transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-cream-deep"
            >
              <svg viewBox="0 0 12 8" className="h-2 w-3 fill-current">
                <path d="M0 0h12L6 8z" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-2xl bg-white p-1 shadow-lg ring-1 ring-hairline">
                <button
                  onClick={downloadJson}
                  className="w-full rounded-xl px-4 py-2.5 text-left text-sm text-espresso transition-all duration-300 hover:bg-cream-deep"
                >
                  Download as JSON
                </button>
              </div>
            )}
          </div>
          <button
            style={{ "--rise-delay": "350ms" } as React.CSSProperties}
            className="rise-in group flex w-full items-center justify-center gap-3 rounded-full bg-espresso px-6 py-3.5 font-display font-semibold text-cream transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.98]"
            onClick={() => navigate({ to: "/report/$id", params: { id } })}
          >
            generate report
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cream/15 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:scale-105">→</span>
          </button>
          <button
            onClick={() => navigate({ to: "/history" })}
            className="text-sm text-espresso-soft underline decoration-hairline underline-offset-4 transition-fluid hover:text-persimmon"
          >
            discard
          </button>
        </div>
      </main>
    </div>
  );
}
