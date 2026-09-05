import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { LocaleSwitcher } from "../components/locale-switcher";
import * as React from "react";
import { useStore } from "@nanostores/react";
import { $draft } from "../stores/session";
import { createSession, uploadDocuments } from "../lib/api";
import * as v from "valibot";
import { ProviderProfileSchema, type RuntimeMode } from "@di/shared";
import { MicCheck } from "../components/mic-check";
import {
  $effectiveRuntime,
  $providerProfile,
  $runtimeMode,
  ensureRuntimeProbe,
  redactKey,
} from "../lib/runtime";

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ACCEPTED = [".pdf", ".md", ".markdown", ".txt", ".docx"];

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "setup — di" }] }),
  component: Setup,
});

const PRESETS = [
  { id: "sysDesign", prompt: "Run a system design interview. Focus on scaling, caching and tradeoff reasoning." },
  { id: "behavioral", prompt: "Run a behavioral interview using the STAR method. Probe for specifics." },
  { id: "frontend", prompt: "Run a frontend interview. Mix of component design and JS fundamentals." },
  { id: "ml", prompt: "Run a machine learning interview. Model choice, evaluation, and data hygiene." },
];

const DURATIONS = [20, 30, 45, 60];

function Setup() {
  const intl = useIntl();
  const draft = useStore($draft);
  const runtimeMode = useStore($runtimeMode);
  const effectiveRuntime = useStore($effectiveRuntime);
  const profile = useStore($providerProfile);
  React.useEffect(() => {
    ensureRuntimeProbe();
  }, []);
  const [baseUrl, setBaseUrl] = React.useState(profile?.baseUrl ?? "");
  const [apiKey, setApiKey] = React.useState(profile?.apiKey ?? "");
  const [llmModel, setLlmModel] = React.useState(profile?.llmModel ?? "");
  const [ttsVoice, setTtsVoice] = React.useState(profile?.ttsVoice ?? "");
  const [ttsModel, setTtsModel] = React.useState(profile?.ttsModel ?? "");
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [profileSaved, setProfileSaved] = React.useState(false);
  const navigate = useNavigate();
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return;
    setError(null);
    const accepted: File[] = [];
    for (const f of incoming) {
      const ext = `.${f.name.split(".").pop()?.toLowerCase()}`;
      if (!ACCEPTED.includes(ext)) {
        setError(intl.formatMessage({ id: "setup.filesBadType" }, { name: f.name }));
        continue;
      }
      accepted.push(f);
    }
    setFiles((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MAX_FILES) {
        setError(intl.formatMessage({ id: "setup.filesTooMany" }, { max: MAX_FILES }));
        return next.slice(0, MAX_FILES);
      }
      if (next.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) {
        setError(intl.formatMessage({ id: "setup.filesTooBig" }));
        return prev;
      }
      return next;
    });
  }

  function setMode(mode: RuntimeMode) {
    $runtimeMode.set(mode);
  }

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaved(false);
    const parsed = v.safeParse(ProviderProfileSchema, {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      llmModel: llmModel.trim(),
      ttsVoice: ttsVoice.trim(),
      ttsModel: ttsModel.trim(),
    });
    if (!parsed.success) {
      const issue = parsed.issues[0];
      const field = String(issue?.path?.[0]?.key ?? "");
      if (field === "baseUrl") setProfileError(intl.formatMessage({ id: "setup.profile.invalidUrl" }));
      else setProfileError(intl.formatMessage({ id: "setup.profile.required" }));
      return;
    }
    setProfileError(null);
    $providerProfile.set(parsed.output);
    setProfileSaved(true);
  }

  async function start(validate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const session = await createSession({
        title: draft.title || PRESETS.find((p) => draft.prompt === p.prompt)?.id || "practice session",
        mode: draft.mode,
        duration_min: draft.durationMin,
      });
      if (files.length > 0) {
        try {
          await uploadDocuments(session.id, files);
        } catch (err) {
          // ingestion failure must not block starting the interview
          setError(err instanceof Error ? err.message : "upload failed");
        }
      }
      navigate({ to: validate ? "/validate/$id" : "/interview/$id", params: { id: session.id } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ambient grain min-h-[100dvh] bg-cream">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-8 md:px-8">
        <a href="/" className="font-display text-xl font-bold tracking-tight">di<span className="text-persimmon">.</span></a>
        <h1 className="text-sm font-normal text-espresso-soft"><FormattedMessage id="setup.title" /></h1>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 md:px-8">
        <div className="rounded-shell bg-paper p-2 ring-1 ring-hairline">
          <div className="rounded-[calc(2rem-0.375rem)] bg-cream p-6 md:p-10">
            <section className="rise-in" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft"><FormattedMessage id="setup.presets" /></h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => $draft.set({ ...draft, prompt: p.prompt, title: p.id })}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                      draft.prompt === p.prompt
                        ? "bg-persimmon text-cream"
                        : "bg-white text-espresso-soft ring-1 ring-hairline hover:ring-persimmon/40"
                    }`}
                  >
                    <FormattedMessage id={`setup.preset.${p.id}`} />
                  </button>
                ))}
              </div>
            </section>

            <section className="rise-in mt-8" style={{ "--rise-delay": "120ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft"><FormattedMessage id="setup.promptLabel" /></h2>
              <textarea
                value={draft.prompt}
                onChange={(e) => $draft.set({ ...draft, prompt: e.target.value })}
                placeholder={intl.formatMessage({ id: "setup.promptPlaceholder" })}
                rows={4}
                className="mt-3 w-full resize-none rounded-card bg-white p-4 text-sm ring-1 ring-hairline outline-none transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
              />
            </section>

            <section className="rise-in mt-8" style={{ "--rise-delay": "240ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">
                <FormattedMessage id="setup.files" /> <span className="normal-case tracking-normal text-espresso-soft">· <FormattedMessage id="setup.filesHint" /></span>
              </h2>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ACCEPTED.join(",")}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div
                role="button"
                tabIndex={0}
                aria-label={intl.formatMessage({ id: "setup.dropHint" })}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                className="mt-3 cursor-pointer rounded-card border border-dashed border-espresso-faint/40 bg-white/60 p-8 text-center text-sm text-espresso-soft transition-fluid hover:border-persimmon/50 hover:text-espresso-soft"
              >
                <FormattedMessage id="setup.dropHint" />
              </div>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-full bg-white px-4 py-2 text-sm ring-1 ring-hairline">
                      <span className="truncate text-espresso">{f.name}</span>
                      <span className="ml-3 flex shrink-0 items-center gap-3 text-xs text-espresso-soft">
                        {Math.round(f.size / 1024)} kb
                        <button
                          aria-label={intl.formatMessage({ id: "setup.fileRemove" }, { name: f.name })}
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-espresso-soft transition-fluid hover:text-persimmon"
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-persimmon-deep">{error}</p>
              )}
            </section>

            <section className="rise-in mt-8" style={{ "--rise-delay": "300ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft"><FormattedMessage id="setup.mic" /></h2>
              <div className="mt-3">
                <MicCheck />
              </div>
            </section>

            <section className="rise-in mt-8 grid gap-6 md:grid-cols-2" style={{ "--rise-delay": "360ms" } as React.CSSProperties}>
              <div>
                <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft"><FormattedMessage id="setup.duration" /></h2>
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
                <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft"><FormattedMessage id="setup.mode" /></h2>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => $draft.set({ ...draft, mode: "interview" })}
                    className={`flex-1 rounded-full py-2 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                      draft.mode === "interview" ? "bg-espresso text-cream" : "bg-white ring-1 ring-hairline text-espresso-soft"
                    }`}
                  >
                    <FormattedMessage id="setup.mode.interview" />
                  </button>
                  <span title={intl.formatMessage({ id: "setup.coachHint" })} aria-disabled className="flex-1 cursor-not-allowed rounded-full bg-white/50 py-2 text-center text-sm font-medium text-espresso-soft ring-1 ring-hairline animate-pulse">
                    <FormattedMessage id="setup.mode.coach" />
                  </span>
                </div>
              </div>
            </section>

            <section className="rise-in mt-8" style={{ "--rise-delay": "300ms" } as React.CSSProperties}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft"><FormattedMessage id="setup.runtime" /></h2>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setMode("local-server")}
                  title={intl.formatMessage({ id: "setup.runtime.localServerHint" })}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                    runtimeMode === "local-server" ? "bg-espresso text-cream" : "bg-white ring-1 ring-hairline text-espresso-soft"
                  }`}
                >
                  <FormattedMessage id="setup.runtime.localServer" />
                </button>
                <button
                  onClick={() => setMode("client-only")}
                  title={intl.formatMessage({ id: "setup.runtime.clientOnlyHint" })}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                    runtimeMode === "client-only" ? "bg-espresso text-cream" : "bg-white ring-1 ring-hairline text-espresso-soft"
                  }`}
                >
                  <FormattedMessage id="setup.runtime.clientOnly" />
                </button>
              </div>
            </section>

            {(runtimeMode === "client-only" || effectiveRuntime === "client-only") && (
              <form onSubmit={saveProfile} className="rise-in mt-8" style={{ "--rise-delay": "320ms" } as React.CSSProperties}>
                <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft"><FormattedMessage id="setup.profile" /></h2>
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="text-xs text-espresso-soft"><FormattedMessage id="setup.profile.baseUrl" /></span>
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={intl.formatMessage({ id: "setup.profile.baseUrlPlaceholder" })}
                      className="mt-1 w-full rounded-card bg-white px-4 py-2.5 text-sm ring-1 ring-hairline outline-none placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-espresso-soft"><FormattedMessage id="setup.profile.apiKey" /></span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={profile ? intl.formatMessage({ id: "setup.profile.apiKeySaved" }, { key: redactKey(profile.apiKey) }) : intl.formatMessage({ id: "setup.profile.apiKeyPlaceholder" })}
                      className="mt-1 w-full rounded-card bg-white px-4 py-2.5 text-sm ring-1 ring-hairline outline-none placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-espresso-soft"><FormattedMessage id="setup.profile.llmModel" /></span>
                    <input
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder={intl.formatMessage({ id: "setup.profile.llmModelPlaceholder" })}
                      className="mt-1 w-full rounded-card bg-white px-4 py-2.5 text-sm ring-1 ring-hairline outline-none placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs text-espresso-soft"><FormattedMessage id="setup.profile.ttsVoice" /></span>
                      <input
                        value={ttsVoice}
                        onChange={(e) => setTtsVoice(e.target.value)}
                        className="mt-1 w-full rounded-card bg-white px-4 py-2.5 text-sm ring-1 ring-hairline outline-none placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-espresso-soft"><FormattedMessage id="setup.profile.ttsModel" /></span>
                      <input
                        value={ttsModel}
                        onChange={(e) => setTtsModel(e.target.value)}
                        className="mt-1 w-full rounded-card bg-white px-4 py-2.5 text-sm ring-1 ring-hairline outline-none placeholder:text-espresso-soft focus:ring-2 focus:ring-persimmon/50"
                      />
                    </label>
                  </div>
                  {profileError && <p role="alert" className="text-sm text-persimmon-deep">{profileError}</p>}
                  {profileSaved && <p className="text-sm text-sage"><FormattedMessage id="setup.profile.saved" /></p>}
                  <button
                    type="submit"
                    className="rounded-full bg-white px-6 py-2.5 text-sm font-medium ring-1 ring-hairline transition-fluid hover:ring-persimmon/50"
                  >
                    <FormattedMessage id="setup.profile.save" />
                  </button>
                </div>
              </form>
            )}

            <section className="rise-in mt-10 flex flex-col items-center gap-3" style={{ "--rise-delay": "480ms" } as React.CSSProperties}>
              <button
                onClick={() => void start(true)}
                disabled={busy}
                className="group inline-flex items-center gap-3 rounded-full bg-espresso px-8 py-4 font-display text-lg font-semibold text-cream transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              >
                <FormattedMessage id="setup.validate" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream/15 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:scale-105">→</span>
              </button>
              <button
                onClick={() => void start(false)}
                className="text-sm text-espresso-soft underline decoration-hairline underline-offset-4 transition-fluid hover:text-persimmon"
              >
                <FormattedMessage id="setup.skipValidation" />
              </button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
