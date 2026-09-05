import * as React from "react";
import { Link } from "@tanstack/react-router";
import { FormattedMessage } from "react-intl";
import { Reveal } from "./reveal";
import { LandingLocaleSwitcher } from "./landing-locale-switcher";
import { useLocaleNav, withLocale } from "../lib/locale-href";

const IS_PUBLIC_SITE = import.meta.env.VITE_PUBLIC_SITE === "1";

const STICKERS = [
  {
    id: "fail",
    rotate: "-rotate-3",
    tone: "bg-persimmon-soft",
    pos: "top-8 right-10",
    delay: 500,
  },
  {
    id: "system",
    rotate: "rotate-2",
    tone: "bg-white",
    pos: "top-64 right-1/3",
    delay: 650,
  },
  {
    id: "resume",
    rotate: "-rotate-2",
    tone: "bg-white",
    pos: "bottom-40 right-16",
    delay: 800,
  },
  {
    id: "whyLeave",
    rotate: "rotate-1",
    tone: "bg-persimmon-faint",
    pos: "top-72 right-24",
    delay: 950,
  },
  {
    id: "quickFire",
    rotate: "-rotate-1",
    tone: "bg-white",
    pos: "bottom-10 left-10",
    delay: 1100,
  },
];

export function LandingPage() {
  const { locale } = useLocaleNav();
  return (
    <div className="ambient grain min-h-[100dvh] bg-cream">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-8 md:px-8">
        <Link
          to={withLocale(locale, "/")}
          className="font-display text-xl font-bold tracking-tight transition-fluid active:scale-[0.98]"
        >
          di<span className="text-persimmon">.</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-espresso-soft">
          <Link
            to={withLocale(locale, "/history")}
            className="transition-fluid hover:text-espresso"
          >
            <FormattedMessage id="nav.history" />
          </Link>
          <a
            href="https://github.com/espetro/dits"
            target="_blank"
            rel="noreferrer"
            className="transition-fluid hover:text-espresso"
          >
            <FormattedMessage id="common.github" />
          </a>
          <LandingLocaleSwitcher />
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-32 pt-16 md:px-8 md:pt-28">
        <Reveal>
          <span className="inline-block rounded-full bg-espresso px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium text-cream">
            <FormattedMessage id="landing.badge" />
          </span>
        </Reveal>

        <Reveal delay={120}>
          <h1 className="mt-8 max-w-3xl font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
            <FormattedMessage
              id="landing.heading"
              values={{
                em: (chunks: React.ReactNode) => <span className="text-persimmon">{chunks}</span>,
              }}
            />
          </h1>
        </Reveal>

        <Reveal delay={240}>
          <p className="mt-6 max-w-md text-lg text-espresso-soft">
            <FormattedMessage id="landing.subtitle" />
          </p>
        </Reveal>

        <Reveal delay={380}>
          <div className="mt-12">
            {IS_PUBLIC_SITE ? (
              <a
                href="https://github.com/espetro/dits/blob/main/docs/setup.md"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-3 rounded-full bg-espresso px-7 py-4 font-display text-lg font-semibold text-cream transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.98]"
              >
                <FormattedMessage id="landing.cta" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream/15 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:scale-105">
                  →
                </span>
              </a>
            ) : (
              <Link
                to={withLocale(locale, "/setup")}
                className="group inline-flex items-center gap-3 rounded-full bg-espresso px-7 py-4 font-display text-lg font-semibold text-cream transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-persimmon active:scale-[0.98]"
              >
                <FormattedMessage id="landing.cta" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream/15 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:scale-105">
                  →
                </span>
              </Link>
            )}
          </div>
        </Reveal>

        {/* sticker / post-it field — staggered float-in, gentle idle drift */}
        <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
          {STICKERS.map((s) => (
            <div
              key={s.id}
              style={{ animationDelay: `${s.delay}ms` }}
              className={`rise-in absolute ${s.pos} ${s.rotate} ${s.tone} w-52 rounded-card p-4 font-display text-sm font-medium leading-snug shadow-[0_20px_50px_-20px_rgba(43,33,24,0.25)] ring-1 ring-hairline transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:rotate-0 hover:scale-[1.03]`}
            >
              “<FormattedMessage id={`landing.sticker.${s.id}`} />”
            </div>
          ))}
        </div>

        <Reveal delay={500}>
          <p className="mt-20 text-xs uppercase tracking-[0.15em] text-espresso-soft">
            <FormattedMessage id="landing.trust" />
          </p>
        </Reveal>
      </main>
    </div>
  );
}
