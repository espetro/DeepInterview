import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LanguageToggle } from "@/components/language-toggle";
import { SetupForm } from "@/components/setup/setup-form";

/**
 * Setup shell: composes the client form island. No auth — OSS runs without
 * sign-in, so there is no sign-out affordance or user resolution here.
 */
export default function SetupPage() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="no-underline">
          <Eyebrow>DeepInterview</Eyebrow>
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
        </div>
      </header>

      <SetupForm />
    </main>
  );
}
