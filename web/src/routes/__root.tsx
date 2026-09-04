import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import "../theme.css";

export const Route = createRootRoute({
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
