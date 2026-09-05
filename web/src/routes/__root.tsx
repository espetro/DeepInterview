import { useEffect } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { FormattedMessage } from "react-intl";
import { AppIntlProvider, useIsRtl } from "../locales/i18n";
import { AppHeader } from "../components/app-header";
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
          <AppHeaderSlot />
          <Outlet />
        </AppIntlProvider>
        <Scripts />
      </body>
    </html>
  );
}

// interview/finish are full-screen flows that carry their own session header.
const HEADER_HIDDEN = /\/(interview|finish)\/[^/]+$/;

const TITLES: Array<[RegExp, string]> = [
  [/\/setup$/, "setup.title"],
  [/\/history$/, "history.title"],
];

function AppHeaderSlot() {
  const pathname = useLocation({ select: (l) => l.pathname });
  if (HEADER_HIDDEN.test(pathname)) return null;
  const titleKey = TITLES.find(([re]) => re.test(pathname))?.[1];
  return (
    <AppHeader
      title={
        titleKey ? (
          <span className="text-sm font-normal text-espresso-soft">
            <FormattedMessage id={titleKey} />
          </span>
        ) : undefined
      }
    />
  );
}
