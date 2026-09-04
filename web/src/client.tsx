import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { AppIntlProvider } from "./locales/i18n";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <AppIntlProvider>
        <StartClient />
      </AppIntlProvider>
    </StrictMode>,
  );
});
