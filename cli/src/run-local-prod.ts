/**
 * `deepinterview-run-local-prod` — boot the full local prod stack.
 *
 * Same UX as the old `scripts/run-local-prod.sh`: validates config, builds
 * (unless --skip-build), starts every service, waits for health, then tails
 * the agent + worker logs until Ctrl-C.
 *
 * The implementation lives in `lib/local-prod/orchestrator.ts` so the
 * pieces (preflight, services, orchestration) are individually testable.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalProd } from "./lib/local-prod/orchestrator.js";

interface CliArgs {
  skipBuild: boolean;
  startWeb: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let skipBuild = false;
  let startWeb = true;
  for (const a of argv) {
    switch (a) {
      case "--skip-build":
        skipBuild = true;
        break;
      case "--no-web":
        startWeb = false;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        process.stderr.write(`unknown flag: ${a}\n`);
        process.exit(2);
    }
  }
  return { skipBuild, startWeb };
}

function printHelp(): void {
  process.stdout.write(
    [
      "deepinterview-run-local-prod — start the full DeepInterview stack locally",
      "",
      "Usage:",
      "  deepinterview-run-local-prod [--skip-build] [--no-web]",
      "",
      "Flags:",
      "  --skip-build   Skip `pnpm build`; expects an existing apps/web/.next",
      "  --no-web       Don't start the Next.js server (api/livekit/worker only)",
      "",
      "Logs: cli/.run-logs/<service>.log (gitignored).",
      "Stop:  Ctrl-C (SIGINT) — all child processes are terminated.",
      "",
    ].join("\n"),
  );
}

/**
 * Walk up from `start` until we find a `package.json` whose `name` is
 * `deepinterview`. This is the workspace root that owns `apps/`,
 * `packages/`, `cli/`, etc. Works for both `tsx cli/src/run-local-prod.ts`
 * (dev) and `node cli/dist/run-local-prod.js` (built).
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "deepinterview") return dir;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate repo root (deepinterview/package.json) from ${start}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(here);
  const logsDir = join(repoRoot, "cli", ".run-logs");

  await runLocalProd({
    repoRoot,
    logsDir,
    skipBuild: args.skipBuild,
    startWeb: args.startWeb,
  });
}

await main();
