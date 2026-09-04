import { useStore } from "@nanostores/react";
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
  en, de, es, fr, ja, "pt-BR": ptBR, "zh-CN": zhCN, ko, it, ar,
};

/** Returns true when the active locale is written right-to-left (drives html dir). */
export function useIsRtl(): boolean {
  return RTL_LOCALES.includes(useStore($locale));
}

/** IntlProvider bound to the persisted $locale nanostore, falling back to en.
 *  During SSR (and the first client render) it always renders "en" so the
 *  prerendered HTML matches hydration; the persisted locale applies after
 *  mount via effect, avoiding React hydration mismatch #418. */
export function AppIntlProvider({ children }: { children: ReactNode }) {
  const storeLocale = useStore($locale);
  const [locale, setLocale] = React.useState("en");
  React.useEffect(() => {
    setLocale(storeLocale);
  }, [storeLocale]);
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
