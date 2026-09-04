import { useEffect } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AppIntlProvider, useIsRtl } from "../locales/i18n";
import "../theme.css";

export const Route = createRootRoute({
  component: RootDocument,
});

function RootDocument() {
  const isRtl = useIsRtl();

  // RTL support at the html level (e.g. for ar).
  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
  }, [isRtl]);

  return (
    <html lang="en" dir={isRtl ? "rtl" : "ltr"}>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppIntlProvider>
          <Outlet />
        </AppIntlProvider>
        <Scripts />
      </body>
    </html>
  );
}
