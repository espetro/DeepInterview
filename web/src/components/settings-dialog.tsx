import { History, Settings } from "lucide-react";
import * as React from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Link } from "@tanstack/react-router";

import { withLocale, useLocale } from "../lib/locale-href";
import { listClientSessions } from "../lib/opfs-store";
import type { Session } from "@di/shared/session";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./vendor/dialog";

/**
 * Centered settings dialog, brioso-style: glass panel with a left nav
 * (History / Settings) and a right pane. Open state is lifted so the user
 * dropdown items can open it directly at a given pane.
 */

export type SettingsPane = "history" | "settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pane: SettingsPane;
  onPaneChange: (pane: SettingsPane) => void;
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
          {pane === "history" ? <HistoryPane /> : <SettingsPanePlaceholder />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
