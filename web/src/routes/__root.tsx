import { useEffect } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AppIntlProvider, useIsRtl, useHtmlLang } from "../locales/i18n";
import "../theme.css";

export const Route = createRootRoute({
  component: RootDocument,
});

function RootDocument() {
  const isRtl = useIsRtl();
  const lang = useHtmlLang();

  // RTL support at the html level (e.g. for ar), for in-app (non-landing) paths
  // where locale is store-driven and only known post-mount.
  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [isRtl, lang]);

  return (
    <html lang={lang} dir={isRtl ? "rtl" : "ltr"}>
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
