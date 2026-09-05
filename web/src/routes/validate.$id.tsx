import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { LocaleSwitcher } from "../components/locale-switcher";
import { getSession } from "../lib/api";

export const Route = createFileRoute("/validate/$id")({
  component: Validate,
});

function Validate() {
  const { id } = Route.useParams();
  const { data: session } = useQuery({
    queryKey: ["session", id],
    queryFn: () => getSession(id),
  });

  return (
    <div className="ambient grain min-h-[100dvh] bg-cream">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-8 md:px-8">
        <a href="/" className="font-display text-xl font-bold tracking-tight">
          di<span className="text-persimmon">.</span>
        </a>
        <span className="text-sm text-espresso-soft">
          <FormattedMessage
            id="validate.header"
            values={{ title: session?.title ?? "…" }}
          />
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-24 pt-10 md:grid-cols-[1.2fr_1fr] md:px-8">
        <div className="rise-in rounded-shell bg-paper p-2 ring-1 ring-hairline">
          <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-[calc(2rem-0.375rem)] bg-cream p-8 text-center">
            <p className="font-display text-lg font-semibold">
              <FormattedMessage id="validate.comingLater" />
            </p>
            <p className="max-w-xs text-sm text-espresso-soft">
              <FormattedMessage id="validate.comingLaterBody" />
            </p>
          </div>
        </div>

        <div
          className="rise-in rounded-shell bg-paper p-2 ring-1 ring-hairline"
          style={{ "--rise-delay": "150ms" } as React.CSSProperties}
        >
          <div className="rounded-[calc(2rem-0.375rem)] bg-cream p-6">
            <h2 className="text-[10px] uppercase tracking-[0.2em] font-medium text-espresso-soft">
              <FormattedMessage id="validate.plan" />
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-espresso-soft">
                  <FormattedMessage id="validate.type" />
                </dt>
                <dd>{session?.title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-espresso-soft">
                  <FormattedMessage id="validate.duration" />
                </dt>
                <dd>{session?.duration_min} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-espresso-soft">
                  <FormattedMessage id="validate.mode" />
                </dt>
                <dd>{session?.mode}</dd>
              </div>
            </dl>
          </div>
        </div>
      </main>

      <div className="mx-auto flex w-full max-w-6xl justify-end px-4 pb-16 md:px-8">
        <Link
          to="/interview/$id"
          params={{ id }}
          className="group inline-flex items-center gap-3 rounded-full bg-espresso px-7 py-3.5 font-display font-semibold text-cream transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.98]"
        >
          <FormattedMessage id="validate.start" />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream/15 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:scale-105">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
