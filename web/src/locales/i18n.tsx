import { useStore } from "@nanostores/react";
import { useLocation } from "@tanstack/react-router";
import { IntlProvider } from "react-intl";
import type { ReactNode } from "react";
import * as React from "react";

import { $locale, LOCALES, RTL_LOCALES } from "../stores/session";
import de from "./de.json";
import ar from "./ar.json";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import it from "./it.json";
import ja from "./ja.json";
import ko from "./ko.json";
import ptBR from "./pt-BR.json";
import zhCN from "./zh-CN.json";

const MESSAGES: Record<string, Record<string, string>> = {
  en,
  de,
  es,
  fr,
  ja,
  "pt-BR": ptBR,
  "zh-CN": zhCN,
  ko,
  it,
  ar,
};

/** Locale-prefixed landing paths (`/`, `/es`, `/fr`, ...) carry the locale in the URL
 *  itself, known at prerender and hydration time alike — no store/localStorage read,
 *  so no hydration-mismatch risk. Returns null for in-app paths, which stay
 *  store-driven. */
function landingLocaleFromPath(pathname: string): string | null {
  if (pathname === "/") return "en";
  const match = pathname.match(/^\/([^/]+)\/?$/);
  const segment = match?.[1];
  if (segment && (LOCALES as readonly string[]).includes(segment))
    return segment;
  return null;
}

/** Returns true when the active locale is written right-to-left (drives html dir). */
export function useIsRtl(): boolean {
  return RTL_LOCALES.includes(useResolvedLocale());
}

/** Locale for the <html lang> attribute: URL-derived on landing paths (known at
 *  prerender time), store-derived (post-mount) elsewhere. */
export function useHtmlLang(): string {
  return useResolvedLocale();
}

function useResolvedLocale(): string {
  const pathname = useLocation({ select: (l) => l.pathname });
  const landingLocale = landingLocaleFromPath(pathname);
  const storeLocale = useStore($locale);
  return landingLocale ?? storeLocale;
}

/** IntlProvider bound to the persisted $locale nanostore, falling back to en.
 *  For locale-prefixed landing paths (`/`, `/$locale`), the locale is derived
 *  directly from the URL so prerendered HTML is correctly localized. For all
 *  other (in-app) paths, it always renders "en" first (SSR + first client
 *  render) then swaps to the persisted $locale store post-mount, to dodge a
 *  hydration mismatch. */
export function AppIntlProvider({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const landingLocale = landingLocaleFromPath(pathname);
  const storeLocale = useStore($locale);
  const [deferredLocale, setDeferredLocale] = React.useState("en");
  React.useEffect(() => {
    setDeferredLocale(storeLocale);
  }, [storeLocale]);
  const locale = landingLocale ?? deferredLocale;
  return (
    <IntlProvider
      locale={locale}
      defaultLocale="en"
      messages={MESSAGES[locale] ?? MESSAGES.en}
      onError={() => {}}
    >
      {children}
    </IntlProvider>
  );
}

export { LOCALES };
