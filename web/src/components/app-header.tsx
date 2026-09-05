import { Link } from "@tanstack/react-router";
import { Github } from "lucide-react";
import type { ReactNode } from "react";

import { useLocale, withLocale } from "../lib/locale-href";

/**
 * Shared app header mounted in __root for every route. Logo links home (en is
 * canonical for the bare root); center slot carries a localized page title;
 * right slot has the GitHub link and a placeholder account button (B3 wires
 * the dropdown).
 */
export function AppHeader({ title }: { title?: ReactNode }) {
  const locale = useLocale();
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-8 md:px-8">
      <Link
        to={withLocale(locale, "/") as "/{-$locale}"}
        className="font-display text-xl font-bold tracking-tight transition-fluid active:scale-[0.98]"
      >
        di<span className="text-persimmon">.</span>
      </Link>
      <div className="flex-1 px-4 text-center text-sm font-normal text-espresso-soft">{title}</div>
      <div className="flex items-center gap-3">
        <a
          href="https://github.com/espetro/dits"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="flex h-8 w-8 items-center justify-center rounded-full text-espresso-soft transition-fluid hover:text-espresso"
        >
          <Github className="h-4 w-4" aria-hidden="true" />
        </a>
        <button
          type="button"
          aria-label="account"
          className="h-8 w-8 rounded-full bg-gradient-to-br from-persimmon to-persimmon-deep ring-1 ring-hairline transition-fluid hover:ring-persimmon/50"
        />
      </div>
    </header>
  );
}

export function AppHeaderLink({ to, children }: { to: string; children: ReactNode }) {
  const locale = useLocale();
  return (
    <Link to={withLocale(locale, to)} className="transition-fluid hover:text-espresso">
      {children}
    </Link>
  );
}
