import { useLocation, useNavigate } from "@tanstack/react-router";

import { LOCALES } from "../stores/session";

const PREFIXED_LOCALES = LOCALES.filter((l) => l !== "en");

/** Locale from the optional first URL segment: `/es/setup` -> es, `/setup` -> en.
 *  Falls back to en for unknown/absent prefixes. */
export function localeFromPathname(pathname: string): string {
  const segment = pathname.split("/")[1];
  if (segment && (LOCALES as readonly string[]).includes(segment)) return segment;
  return "en";
}

/** Prefix an in-app path with the locale segment (en gets no prefix). */
export function withLocale(locale: string, path: string): string {
  if (!PREFIXED_LOCALES.includes(locale as (typeof PREFIXED_LOCALES)[number])) return path;
  return `/${locale}${path === "/" ? "" : path}`;
}

/** Rewrites a pathname so its locale prefix (or lack thereof) becomes `locale`. */
export function replaceLocale(pathname: string, locale: string): string {
  const rest = pathname.split("/").slice(2).join("/");
  const suffix = rest ? `/${rest}` : "";
  return withLocale(locale, `/${suffix}` || "/");
}

/** Current URL-derived locale plus locale-aware navigation helpers. */
export function useLocaleNav() {
  const locale = useLocale();
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  return {
    locale,
    /** navigate to `path` (unprefixed, e.g. `/setup`) under the current locale */
    go: (path: string, opts?: { replace?: boolean }) =>
      void navigate({
        href: withLocale(localeFromPathname(pathname), path),
        replace: opts?.replace,
      }),
  };
}

/** Hook: locale derived from the current router location. */
export function useLocale(): string {
  const pathname = useLocation({ select: (l) => l.pathname });
  return localeFromPathname(pathname);
}
