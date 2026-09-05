import { useLinkProps } from "@tanstack/react-router";
import { FormattedMessage } from "react-intl";

import { LOCALES } from "../stores/session";

/**
 * Real-link language nav for the marketing landing pages (`/`, `/$locale`).
 * Unlike the in-app LocaleSwitcher (a store-mutating select), this renders
 * actual <Link>s so TanStack Start's prerender.crawlLinks can discover and
 * prerender every locale page from the root, and so switching locale here is
 * crawlable/SEO-visible navigation rather than client-only state.
 */
export function LandingLocaleSwitcher() {
  return (
    <nav aria-label="language" className="flex items-center gap-1.5 text-sm text-espresso-soft">
      <span className="sr-only">
        <FormattedMessage id="locale.label" />
      </span>
      {LOCALES.map((l) => (
        <LocaleLink key={l} locale={l} />
      ))}
    </nav>
  );
}

function LocaleLink({ locale }: { locale: string }) {
  // href strings for locale landings are not typed route paths (the `{-$locale}`
  // prefix is optional), so build the anchor through useLinkProps.
  const linkProps = useLinkProps({
    href: locale === "en" ? "/" : `/${locale}`,
  } as Parameters<typeof useLinkProps>[0]);
  return (
    <a
      {...linkProps}
      className="rounded-full px-2 py-1 font-medium transition-fluid hover:text-espresso [&.active]:text-espresso [&.active]:underline"
    >
      {locale}
    </a>
  );
}
