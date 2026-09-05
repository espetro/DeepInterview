import { createFileRoute, notFound } from "@tanstack/react-router";
import { LandingPage } from "../components/landing-page";
import { LOCALES } from "../stores/session";

const PREFIXED_LOCALES = LOCALES.filter((l) => l !== "en");

export const Route = createFileRoute("/$locale")({
  beforeLoad: ({ params }) => {
    if (!PREFIXED_LOCALES.includes(params.locale as (typeof PREFIXED_LOCALES)[number])) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: "di — mock interviews" }] }),
  component: LandingPage,
});
