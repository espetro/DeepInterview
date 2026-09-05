import { createFileRoute, Link } from "@tanstack/react-router";
import { useLocaleNav, withLocale } from "../../lib/locale-href";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { listSessions } from "../../lib/api";

export const Route = createFileRoute("/{-$locale}/history")({
  head: () => ({ meta: [{ title: "history — di" }] }),
  component: History,
});

function useRelative() {
  const intl = useIntl();
  return (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days < 1) return intl.formatMessage({ id: "history.today" });
    if (days === 1) return intl.formatMessage({ id: "history.yesterday" });
    if (days < 7) return intl.formatMessage({ id: "history.daysAgo" }, { n: days });
    return intl.formatMessage({ id: "history.weeksAgo" }, { n: Math.floor(days / 7) });
  };
}

function History() {
  const relative = useRelative();
  const { locale } = useLocaleNav();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });

  function target(status: string, id: string) {
    if (status === "reported") return withLocale(locale, `/report/${id}`);
    if (status === "finished") return withLocale(locale, `/finish/${id}`);
    return withLocale(locale, `/interview/${id}`);
  }

  return (
    <div className="ambient grain min-h-[100dvh] bg-cream">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-8 md:px-8">
        <Link
          to={withLocale(locale, "/")}
          className="font-display text-xl font-bold tracking-tight"
        >
          di<span className="text-persimmon">.</span>
        </Link>
        <h1 className="text-sm font-normal text-espresso-soft">
          <FormattedMessage id="history.title" />
        </h1>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 md:px-8">
        {isLoading ? (
          <p className="text-sm text-espresso-soft">
            <FormattedMessage id="history.loading" />
          </p>
        ) : (sessions ?? []).length === 0 ? (
          <p className="text-sm text-espresso-soft">
            <FormattedMessage id="history.empty" />
          </p>
        ) : (
          <div className="space-y-3">
            {(sessions ?? []).map((s, i) => (
              <Link
                key={s.id}
                style={
                  {
                    "--rise-delay": `${Math.min(i * 70, 500)}ms`,
                  } as React.CSSProperties
                }
                to={target(s.status, s.id)}
                className="rise-in flex items-center justify-between rounded-card bg-paper p-2 ring-1 ring-hairline transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:ring-persimmon/40 active:scale-[0.99]"
              >
                <div className="rounded-[calc(1.5rem-0.375rem)] bg-cream px-5 py-4">
                  <p className="font-display font-semibold">{s.title}</p>
                  <p className="text-xs text-espresso-soft">
                    {s.mode} · {s.duration_min} min · {s.status} · {relative(s.created_at)}
                  </p>
                </div>
                <span className="pr-4 text-espresso-soft">→</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
