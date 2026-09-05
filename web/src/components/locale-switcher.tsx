import { useStore } from "@nanostores/react";
import { FormattedMessage } from "react-intl";

import { LOCALES, $locale } from "../stores/session";

/**
 * Minimal language select for header placement. Persists via $locale
 * (localStorage-backed persistentAtom); active locale applies app-wide.
 * Used on in-app routes (setup, validate) where switching locale should not
 * navigate away from the current screen.
 */
export function LocaleSwitcher() {
  const locale = useStore($locale);
  return (
    <label className="flex items-center gap-1.5 text-sm text-espresso-soft">
      <span className="sr-only">
        <FormattedMessage id="locale.label" />
      </span>
      <select
        value={locale}
        onChange={(e) => $locale.set(e.target.value)}
        aria-label="language"
        className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-sm font-medium text-espresso-soft ring-1 ring-hairline outline-none transition-fluid hover:ring-persimmon/40 focus:ring-2 focus:ring-persimmon/50"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
