import { Outlet, createRootRoute } from "@tanstack/react-router";
import "../theme.css";

export const Route = createRootRoute({
  component: () => <Outlet />,
});
