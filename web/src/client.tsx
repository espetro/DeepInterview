import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { IntlProvider } from "react-intl";
import en from "./locales/en.json";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <IntlProvider locale="en" defaultLocale="en" messages={en.en}>
        <StartClient />
      </IntlProvider>
    </StrictMode>,
  );
});
