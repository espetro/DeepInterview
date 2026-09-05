import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLocale, withLocale } from "../../lib/locale-href";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@nanostores/react";
import * as React from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useVoice } from "../../lib/voice/use-voice";
import { FormattedMessage, useIntl } from "react-intl";
import { getSession, getTurns, postTextTurn, pushToolState } from "../../lib/api";
import { getClientSession } from "../../lib/opfs-store";
import { $clientTurns } from "../../lib/agent/session-store";
import { $effectiveRuntime } from "../../lib/runtime";
import {
  $editorBuffer,
  $muted,
  $question,
  $transcriptOpen,
  $whiteboard,
} from "../../stores/session";

const WhiteboardPanel = lazy(() =>
  import("../../components/whiteboard-panel").then((m) => ({
    default: m.WhiteboardPanel,
  })),
);

export const Route = createFileRoute("/{-$locale}/interview/$id")({
  component: Interview,
});

function useCountdown(durationMin: number) {
  const [secsLeft, setSecsLeft] = useState(durationMin * 60);
  const startedRef = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setSecsLeft(
        Math.max(0, durationMin * 60 - Math.floor((Date.now() - startedRef.current) / 1000)),
      );
    }, 1000);
    return () => clearInterval(t);
  }, [durationMin]);
  return secsLeft;
}

const phaseKeys: Record<string, string> = {
  listening: "interview.phase.listening",
  user_speaking: "interview.phase.userSpeaking",
  thinking: "interview.phase.thinking",
  agent_speaking: "interview.phase.agentSpeaking",
  interrupted: "interview.phase.interrupted",
};

function Interview() {
  const intl = useIntl();
  const { id } = Route.useParams();
  const locale = useLocale();
  const navigate = useNavigate();
  const effectiveRuntime = useStore($effectiveRuntime);
  const clientOnly = effectiveRuntime === "client-only";
  const { data: session } = useQuery({
    queryKey: ["session", id, effectiveRuntime],
    queryFn: () => (clientOnly ? getClientSession(id) : getSession(id)),
  });
  const { data: polledTurns } = useQuery({
    queryKey: ["turns", id],
    queryFn: () => getTurns(id),
    refetchInterval: 2000,
    enabled: !clientOnly,
  });
  const clientTurns = useStore($clientTurns);
  const turns = clientOnly ? clientTurns : polledTurns;
  const question = useStore($question);
  const transcriptOpen = useStore($transcriptOpen);
  const muted = useStore($muted);
  const [tab, setTab] = useState<"editor" | "whiteboard">("editor");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [text, setText] = useState("");
  const editor = useStore($editorBuffer);
  const whiteboard = useStore($whiteboard);
  const voice = useVoice(id, muted);
  const orbLive = voice.agentSpeaking || (voice.status === "connected" && !muted);
  const statusKey =
    voice.status === "error"
      ? "interview.voiceError"
      : voice.status === "connected"
        ? (phaseKeys[voice.phase] ?? "interview.voiceConnected")
        : voice.status === "connecting"
          ? "interview.voiceConnecting"
          : "interview.voiceIdle";

  // Mirror browser-held editor/whiteboard state to di so the voice agent can
  // read it. Client-only mode's tool executors read the stores in-process
  // (see createStoreToolExecutors), so there is nothing to push.
  useEffect(() => {
    if (clientOnly) return;
    const t = setTimeout(() => {
      pushToolState(id, { editor, whiteboard }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [id, editor, whiteboard, clientOnly]);

  const secsLeft = useCountdown(session?.duration_min ?? 30);
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const ss = String(secsLeft % 60).padStart(2, "0");
  const wrapping = secsLeft <= 120;

  useEffect(() => {
    if (secsLeft === 0) navigate({ href: withLocale(locale, `/finish/${id}`) });
  }, [secsLeft, id, navigate]);

  // browser-driver fallback: read new agent turns aloud as turns polling finds
  // them (server driver plays tts chunks off the WS instead)
  const seenTurns = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of turns ?? []) {
      if (t.speaker !== "agent" || seenTurns.current.has(t.id)) continue;
      seenTurns.current.add(t.id);
      voice.speakAgentTurn(t.text);
    }
  }, [turns, voice]);

  async function sendText() {
    if (!text.trim()) return;
    if (clientOnly) {
      voice.sendText(text.trim());
    } else {
      await postTextTurn(id, text.trim());
    }
    setText("");
  }

  return (
    <div className="ambient grain flex h-[100dvh] flex-col overflow-hidden bg-cream">
      {/* top bar */}
      <header className="flex items-center justify-between px-4 py-3 md:px-8">
        <h1 className="font-display text-base font-semibold">{session?.title ?? "…"}</h1>
        <div className="flex items-center gap-4">
          <span
            className={`font-mono text-sm tabular-nums ${wrapping ? "text-persimmon" : "text-espresso-soft"}`}
          >
            {mm}:{ss}
          </span>
          <span
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-espresso-soft"
            title={
              voice.status === "error"
                ? intl.formatMessage({ id: "interview.voiceError" }, { message: voice.error ?? "" })
                : undefined
            }
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                voice.status === "connected"
                  ? "bg-sage"
                  : voice.status === "error"
                    ? "bg-persimmon"
                    : "bg-espresso-soft/40 animate-pulse"
              }`}
            />
            {intl.formatMessage({ id: statusKey })}
          </span>
          <div
            className={`h-10 w-10 rounded-full bg-gradient-to-br from-persimmon to-persimmon-deep transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              muted ? "opacity-30 saturate-0" : orbLive ? "orb-live" : "opacity-60"
            }`}
            role="img"
            aria-label={intl.formatMessage({
              id: muted ? "interview.voiceMuted" : "interview.voiceActive",
            })}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 md:px-8">
        {/* main column */}
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {/* question block — agent-editable */}
          <section className="rounded-card bg-paper p-2 ring-1 ring-hairline">
            <div className="rounded-[calc(1.5rem-0.375rem)] bg-persimmon-faint p-5 md:p-6">
              <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-persimmon-deep">
                <FormattedMessage id="interview.question" />
              </p>
              <p
                key={question.text}
                className="rise-in mt-2 font-display text-xl font-semibold leading-snug md:text-2xl"
              >
                {question.text || intl.formatMessage({ id: "interview.preparing" })}
              </p>
              {question.hints.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {question.hints.map((h, i) => (
                    <li
                      key={h}
                      style={{ "--rise-delay": `${i * 80}ms` } as React.CSSProperties}
                      className="rise-in rounded-full bg-white px-3 py-1 text-xs text-espresso-soft ring-1 ring-hairline"
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* tabbed tools */}
          <section className="flex min-h-0 flex-1 flex-col rounded-card bg-paper p-2 ring-1 ring-hairline">
            <div className="flex gap-1 p-1">
              {(["editor", "whiteboard"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    tab === t ? "bg-espresso text-cream" : "text-espresso-soft hover:bg-cream-deep"
                  }`}
                >
                  <FormattedMessage
                    id={t === "editor" ? "interview.tab.editor" : "interview.tab.whiteboard"}
                  />
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 rounded-[calc(1.5rem-0.375rem)] bg-cream p-4">
              {tab === "editor" ? (
                <EditorPanel />
              ) : mounted ? (
                <Suspense
                  fallback={
                    <div
                      className="h-full w-full animate-pulse rounded-2xl bg-espresso/5"
                      aria-label={intl.formatMessage({
                        id: "interview.whiteboardLoading",
                      })}
                    />
                  }
                >
                  <WhiteboardPanel />
                </Suspense>
              ) : (
                <div
                  className="h-full w-full animate-pulse rounded-2xl bg-espresso/5"
                  aria-label={intl.formatMessage({
                    id: "interview.whiteboardLoading",
                  })}
                />
              )}
            </div>
          </section>

          {/* controls */}
          <div className="flex gap-3">
            <button
              onClick={() => $muted.set(!muted)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-medium ring-1 ring-hairline transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:ring-persimmon/50 active:scale-[0.97]"
            >
              <FormattedMessage id={muted ? "interview.unmute" : "interview.mute"} />
            </button>
            <button
              onClick={() => navigate({ href: withLocale(locale, `/finish/${id}`) })}
              className="rounded-full bg-espresso px-5 py-2.5 text-sm font-medium text-cream transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.97]"
            >
              <FormattedMessage id="interview.endEarly" />
            </button>
          </div>
        </main>

        {/* transcript panel — translucent, collapsible to peek rail, never hidden */}
        <aside
          className={`flex flex-col rounded-card ring-1 ring-hairline bg-paper/15 backdrop-blur-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            transcriptOpen ? "w-80" : "w-14"
          }`}
        >
          <button
            onClick={() => $transcriptOpen.set(!transcriptOpen)}
            className="flex items-center justify-center py-3 text-xs font-medium uppercase tracking-[0.15em] text-espresso-soft"
            aria-expanded={transcriptOpen}
          >
            {transcriptOpen ? "transcript —" : "T +"}
          </button>
          {transcriptOpen && (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
                {(turns ?? []).map((t) => (
                  <div
                    key={t.id}
                    className={`rise-in rounded-2xl px-3 py-2 text-sm ${t.speaker === "agent" ? "bg-persimmon-faint" : "bg-white/70"}`}
                  >
                    <span className="block text-[10px] uppercase tracking-wider text-espresso-soft">
                      {t.speaker} · {t.source}
                    </span>
                    {t.text}
                  </div>
                ))}
              </div>
              <div className="p-3">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void sendText()}
                  placeholder={intl.formatMessage({
                    id: "interview.typeInstead",
                  })}
                  className="w-full rounded-full bg-white px-4 py-2.5 text-sm ring-1 ring-hairline outline-none transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
                />
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function EditorPanel() {
  const intl = useIntl();
  const buffer = useStore($editorBuffer);
  return (
    <div className="flex h-full flex-col gap-2">
      <textarea
        value={buffer}
        onChange={(e) => $editorBuffer.set(e.target.value)}
        placeholder={intl.formatMessage({ id: "interview.editorPlaceholder" })}
        spellCheck={false}
        className="w-full flex-1 resize-none rounded-2xl bg-[#1a1512] p-4 font-mono text-sm leading-relaxed text-[#e8e0d8] outline-none placeholder:text-[#6b5d4f]"
      />
    </div>
  );
}
