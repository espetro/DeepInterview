import { Bot, History, Settings } from "lucide-react";
import * as React from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Link } from "@tanstack/react-router";
import * as v from "valibot";

import { withLocale, useLocale } from "../lib/locale-href";
import { listClientSessions } from "../lib/opfs-store";
import type { Session } from "@di/shared/session";
import { ProviderSectionsSchema } from "@di/shared";
import type { ProviderEndpoint, ProviderSections, TtsEndpoint } from "@di/shared";
import { $providerProfile, redactKey } from "../lib/runtime";
import { synthesizeSpeech } from "../lib/agent/tts";
import { createOpenAiCompatibleModel } from "../lib/agent/openai-compatible-provider";
import { useStore } from "@nanostores/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./vendor/dialog";

/**
 * Centered settings dialog, brioso-style: glass panel with a left nav
 * (History / AI Provider / Settings) and a right pane. Open state is lifted
 * so the user dropdown items can open it directly at a given pane.
 */

export type SettingsPane = "history" | "settings" | "aiProvider";

/** Tiny event API so any route can open the settings dialog at a pane. */
const OPEN_EVENT = "di:open-settings";
export function openSettings(pane: SettingsPane = "settings"): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: pane }));
}

/** Mount once near the app root: wires the openSettings() event to the dialog. */
export function SettingsDialogHost() {
  const [open, setOpen] = React.useState(false);
  const [pane, setPane] = React.useState<SettingsPane>("settings");
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      setPane((e as CustomEvent<SettingsPane>).detail ?? "settings");
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  return <SettingsDialog open={open} onOpenChange={setOpen} pane={pane} onPaneChange={setPane} />;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function useHistoryPane() {
  const locale = useLocale();
  const intl = useIntl();
  const [sessions, setSessions] = React.useState<Session[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    listClientSessions()
      .then((all) => {
        if (cancelled) return;
        all.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setSessions(all);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function target(s: Session): string {
    if (s.status === "reported") return withLocale(locale, `/report/${s.id}`);
    if (s.status === "finished") return withLocale(locale, `/finish/${s.id}`);
    return withLocale(locale, `/interview/${s.id}`);
  }

  function relative(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days < 1) return intl.formatMessage({ id: "history.today" });
    if (days === 1) return intl.formatMessage({ id: "history.yesterday" });
    if (days < 7) return intl.formatMessage({ id: "history.daysAgo" }, { n: days });
    return intl.formatMessage({ id: "history.weeksAgo" }, { n: Math.floor(days / 7) });
  }

  return { sessions, target, relative };
}

function HistoryPane() {
  const { sessions, target, relative } = useHistoryPane();

  if (sessions === null) {
    return <p className="text-sm text-muted-foreground">…</p>;
  }
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage id="history.empty" />
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <Link
          key={s.id}
          to={target(s)}
          className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted/60"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{s.title}</span>
            <span className="block text-xs text-muted-foreground">
              {s.status} · {relative(s.created_at)}
            </span>
          </span>
          <span
            className={
              "ml-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
              (s.status === "reported"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground")
            }
          >
            {s.status}
          </span>
        </Link>
      ))}
    </div>
  );
}

function SettingsPanePlaceholder() {
  return (
    <div className="rounded-lg border border-dashed p-4">
      <p className="text-sm text-muted-foreground">
        <FormattedMessage id="settings.comingSoon" />
      </p>
    </div>
  );
}

/** Per-section editable endpoint state (empty string = not set). */
interface SectionDraft {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
}

const EMPTY_SECTION: SectionDraft = {
  enabled: false,
  baseUrl: "",
  apiKey: "",
  model: "",
  voice: "",
};

function draftFromEndpoint(endpoint: ProviderEndpoint | TtsEndpoint | undefined): SectionDraft {
  if (!endpoint) return { ...EMPTY_SECTION };
  return {
    enabled: true,
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    model: endpoint.model,
    voice: "voice" in endpoint ? endpoint.voice : "",
  };
}

type SectionKey = "stt" | "tts" | "llm";
type TestState = { status: "idle" | "running" | "ok" | "err"; message?: string };

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";
const fieldClass = "block text-xs text-muted-foreground";
const testButtonClass =
  "rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50";

/** /models probe shared by all sections: the endpoint class is the same. */
async function probeModels(draft: SectionDraft): Promise<void> {
  const base = draft.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const res = await fetch(`${base}/v1/models`, {
    headers: { authorization: `Bearer ${draft.apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function AiProviderPane() {
  const intl = useIntl();
  const profile = useStore($providerProfile);
  const [tab, setTab] = React.useState<SectionKey>("llm");
  const [drafts, setDrafts] = React.useState<Record<SectionKey, SectionDraft>>(() => ({
    stt: draftFromEndpoint(profile?.stt),
    tts: draftFromEndpoint(profile?.tts),
    llm: profile?.llm
      ? {
          enabled: true,
          baseUrl: profile.llm.baseUrl,
          apiKey: profile.llm.apiKey,
          model: profile.llm.model,
          voice: "",
        }
      : { ...EMPTY_SECTION },
  }));
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [testing, setTesting] = React.useState<SectionKey | null>(null);
  const [testState, setTestState] = React.useState<Partial<Record<SectionKey, TestState>>>({});

  const draft = drafts[tab];
  const llmComplete =
    !drafts.llm.enabled || (drafts.llm.baseUrl && drafts.llm.apiKey && drafts.llm.model);
  const llmOk = drafts.llm.enabled ? Boolean(llmComplete) : Boolean(profile?.llm);
  const canSave = llmOk || drafts.llm.enabled;

  function update(patch: Partial<SectionDraft>) {
    setDrafts((prev) => ({ ...prev, [tab]: { ...prev[tab], ...patch } }));
    setSaved(false);
    setError(null);
  }

  function buildProfile(): ProviderSections {
    const out: ProviderSections = {};
    if (drafts.llm.enabled && drafts.llm.baseUrl && drafts.llm.apiKey && drafts.llm.model) {
      out.llm = { baseUrl: drafts.llm.baseUrl, apiKey: drafts.llm.apiKey, model: drafts.llm.model };
    }
    if (drafts.stt.enabled && drafts.stt.baseUrl && drafts.stt.apiKey && drafts.stt.model) {
      out.stt = { baseUrl: drafts.stt.baseUrl, apiKey: drafts.stt.apiKey, model: drafts.stt.model };
    }
    if (drafts.tts.enabled && drafts.tts.baseUrl && drafts.tts.apiKey && drafts.tts.model) {
      out.tts = {
        baseUrl: drafts.tts.baseUrl,
        apiKey: drafts.tts.apiKey,
        model: drafts.tts.model,
        voice: drafts.tts.voice,
      };
    }
    return out;
  }

  function save() {
    setSaved(false);
    const profile = buildProfile();
    if (!profile.llm) {
      setError(intl.formatMessage({ id: "settings.llmRequired" }));
      return;
    }
    const parsed = v.safeParse(ProviderSectionsSchema, profile);
    if (!parsed.success) {
      setError(intl.formatMessage({ id: "settings.invalid" }));
      return;
    }
    setError(null);
    $providerProfile.set(parsed.output);
    setSaved(true);
  }

  async function runTest() {
    setTesting(tab);
    setTestState((prev) => ({ ...prev, [tab]: { status: "running" } }));
    try {
      if (tab === "llm") {
        const d = draft;
        if (!d.enabled) throw new Error(intl.formatMessage({ id: "settings.test.inBrowser" }));
        const model = createOpenAiCompatibleModel(
          { baseUrl: d.baseUrl, apiKey: d.apiKey, model: d.model },
          {},
        );
        const { streamText } = await import("ai");
        let reply = "";
        const { textStream } = streamText({
          model,
          prompt: "Reply with the single word: ok",
          maxOutputTokens: 5,
        });
        for await (const delta of textStream) reply += delta;
        setTestState((prev) => ({ ...prev, llm: { status: "ok", message: reply.slice(0, 40) } }));
      } else if (tab === "tts") {
        const d = draft;
        if (!d.enabled) throw new Error(intl.formatMessage({ id: "settings.test.inBrowser" }));
        const pcm = await synthesizeSpeech(
          {
            baseUrl: d.baseUrl,
            apiKey: d.apiKey,
            model: d.model || "tts-1",
            voice: d.voice,
          },
          "hello",
        );
        if (pcm.length === 0) throw new Error("empty audio");
        setTestState((prev) => ({ ...prev, tts: { status: "ok" } }));
      } else {
        if (!draft.enabled) throw new Error(intl.formatMessage({ id: "settings.test.inBrowser" }));
        await probeModels(draft);
        setTestState((prev) => ({ ...prev, stt: { status: "ok" } }));
      }
    } catch (err) {
      setTestState((prev) => ({
        ...prev,
        [tab]: { status: "err", message: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setTesting(null);
    }
  }

  const tabs: { key: SectionKey; label: string }[] = [
    { key: "stt", label: intl.formatMessage({ id: "settings.stt" }) },
    { key: "tts", label: intl.formatMessage({ id: "settings.tts" }) },
    { key: "llm", label: intl.formatMessage({ id: "settings.llm" }) },
  ];
  const state = testState[tab];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
              (tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={`${tab}-mode`}
              checked={!draft.enabled}
              onChange={() => update({ enabled: false })}
              disabled={tab === "llm"}
            />
            <FormattedMessage id="settings.inBrowser" />
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={`${tab}-mode`}
              checked={draft.enabled}
              onChange={() => update({ enabled: true })}
            />
            <FormattedMessage id="settings.customEndpoint" />
          </label>
        </div>
        {tab === "llm" && !draft.enabled && (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage id="settings.llmRequired" />
          </p>
        )}

        {draft.enabled && (
          <div className="space-y-2">
            <label className="block">
              <span className={fieldClass}>
                <FormattedMessage id="settings.baseUrl" />
              </span>
              <input
                value={draft.baseUrl}
                onChange={(e) => update({ baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={fieldClass}>
                <FormattedMessage id="settings.apiKey" />
              </span>
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder={
                  profile?.[tab]
                    ? intl.formatMessage(
                        { id: "settings.apiKeySaved" },
                        { key: redactKey(profile[tab]!.apiKey) },
                      )
                    : ""
                }
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={fieldClass}>
                <FormattedMessage id="settings.model" />
              </span>
              <input
                value={draft.model}
                onChange={(e) => update({ model: e.target.value })}
                className={inputClass}
              />
            </label>
            {tab === "tts" && (
              <label className="block">
                <span className={fieldClass}>
                  <FormattedMessage id="settings.voice" />
                </span>
                <input
                  value={draft.voice}
                  onChange={(e) => update({ voice: e.target.value })}
                  className={inputClass}
                />
              </label>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={!draft.enabled || testing === tab}
            className={testButtonClass}
          >
            {testing === tab ? "…" : <FormattedMessage id="settings.test" />}
          </button>
          {state?.status === "ok" && (
            <span className="text-xs text-emerald-600">
              ok{state.message ? `: ${state.message}` : ""}
            </span>
          )}
          {state?.status === "err" && <span className="text-xs text-red-600">{state.message}</span>}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-emerald-600">
          <FormattedMessage id="settings.saved" />
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
      >
        <FormattedMessage id="settings.save" />
      </button>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange, pane, onPaneChange }: SettingsDialogProps) {
  const isMobile = useIsMobile();
  const intl = useIntl();

  const tabs: { id: SettingsPane; label: string; icon: React.ReactNode }[] = [
    {
      id: "history",
      label: intl.formatMessage({ id: "account.history" }),
      icon: <History className="size-4" aria-hidden="true" />,
    },
    {
      id: "aiProvider",
      label: intl.formatMessage({ id: "settings.aiProvider" }),
      icon: <Bot className="size-4" aria-hidden="true" />,
    },
    {
      id: "settings",
      label: intl.formatMessage({ id: "account.settings" }),
      icon: <Settings className="size-4" aria-hidden="true" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "inset-0 h-svh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 [&>button]:hidden"
            : "flex h-[min(28rem,calc(100vh-4rem))] w-[calc(100vw-2rem)] max-w-2xl flex-row gap-0 overflow-hidden rounded-2xl border-border/70 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl"
        }
      >
        <DialogTitle className="sr-only">
          <FormattedMessage id="settings.title" />
        </DialogTitle>
        <DialogDescription className="sr-only">
          <FormattedMessage id="settings.title" />
        </DialogDescription>
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 p-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onPaneChange(tab.id)}
              className={
                "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm " +
                (pane === tab.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
              }
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="m-2 ml-0 flex-1 overflow-y-auto rounded-xl bg-card p-5">
          {pane === "history" ? (
            <HistoryPane />
          ) : pane === "aiProvider" ? (
            <AiProviderPane />
          ) : (
            <SettingsPanePlaceholder />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pane: SettingsPane;
  onPaneChange: (pane: SettingsPane) => void;
}
