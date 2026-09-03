/**
 * `deepinterview run-local-prod [...flags]` — same behaviour as the
 * standalone bin entrypoint. Lives in commands/ for symmetry with the
 * other CLI commands (init, skills, avatars, traces).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { runLocalProd } from "../lib/local-prod/orchestrator.js";

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
        process.stdout.write(
          [
            "deepinterview run-local-prod -- boot the full local prod stack",
            "",
            "Usage: deepinterview run-local-prod [--skip-build] [--no-web]",
            "",
          ].join("\n"),
        );
        process.exit(0);
        break;
      default:
        process.stderr.write(`unknown flag: ${a}\n`);
        process.exit(2);
    }
  }
  return { skipBuild, startWeb };
}

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

export async function runRunLocalProd(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  // commands/ is 2 levels below repo root in both src/ and dist/ trees.
  const here = __dirname;
  const repoRoot = findRepoRoot(here);
  const logsDir = join(repoRoot, "cli", ".run-logs");
  await runLocalProd({
    repoRoot,
    logsDir,
    skipBuild: args.skipBuild,
    startWeb: args.startWeb,
  });
}
