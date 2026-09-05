import { FormattedMessage } from "react-intl";

import { LOCALES } from "../stores/session";
import { replaceLocale, useLocaleNav } from "../lib/locale-href";

/**
 * Language select for in-app routes. The URL's locale prefix is the source of
 * truth, so switching locale navigates to the same path under the new prefix
 * (en strips the prefix entirely).
 */
export function LocaleSwitcher() {
  const { locale } = useLocaleNav();
  return (
    <label className="flex items-center gap-1.5 text-sm text-espresso-soft">
      <span className="sr-only">
        <FormattedMessage id="locale.label" />
      </span>
      <select
        value={locale}
        onChange={(e) => {
          window.location.assign(replaceLocale(window.location.pathname, e.target.value));
        }}
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
