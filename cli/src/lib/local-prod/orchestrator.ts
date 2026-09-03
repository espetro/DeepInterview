/**
 * Orchestrates the local-prod stack: preflight → build → start services →
 * wait for health → install cleanup trap → tail logs until SIGINT.
 *
 * Each step is small and returns structured data. Errors throw with
 * enough context that the user can fix the problem without reading the
 * script.
 */

import { spawn, ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, truncateSync, watch } from "node:fs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from "node:net";

import { buildServices, buildWebService, type HealthCheck, type ServiceSpec } from "./services.js";
import {
  checkBinaries,
  checkEnvFilePresent,
  checkEnvKeys,
  checkLiveKitKeyPairing,
  checkPortsFree,
  checkUiToml,
  readEnvFile,
  rollup,
  which,
  type PreflightIssue,
} from "./preflight.js";

const CYAN = "\x1b[1;36m";
const GREEN = "\x1b[0;32m";
const RED = "\x1b[0;31m";
const YELLOW = "\x1b[0;33m";
const NC = "\x1b[0m";

function step(label: string) {
  process.stdout.write(`${CYAN}==> ${label}${NC}\n`);
}
function ok(label: string) {
  process.stdout.write(`${GREEN}  ok:${NC} ${label}\n`);
}
function warn(label: string) {
  process.stdout.write(`${YELLOW}  warn:${NC} ${label}\n`);
}
function die(label: string): never {
  process.stderr.write(`${RED}  error:${NC} ${label}\n`);
  process.exit(1);
}

export interface OrchestratorOptions {
  repoRoot: string;
  logsDir: string;
  skipBuild: boolean;
  startWeb: boolean;
}

interface RunningService {
  spec: ServiceSpec;
  proc: ChildProcess;
}

export async function runLocalProd(opts: OrchestratorOptions): Promise<void> {
  const { repoRoot, logsDir, skipBuild, startWeb } = opts;

  // 1. Preflight
  step("preflight");
  await runPreflight(repoRoot, startWeb);

  // 2. Logs dir + truncation
  mkdirSync(logsDir, { recursive: true });
  for (const f of [
    "livekit",
    "stt",
    "tts",
    "tts-shim",
    "agent",
    "worker",
    "web",
  ]) {
    const p = join(logsDir, `${f}.log`);
    if (existsSync(p)) truncateSync(p, 0);
  }
  ok(`logs at ${logsDir}`);

  // 3. Build (unless skipped)
  if (!skipBuild) {
    step("building (pnpm build)");
    const zx = await import("zx");
    await zx.$({ cwd: repoRoot })`pnpm build`;
  } else {
    warn("skipping build (--skip-build); expecting existing apps/web/.next");
    if (!existsSync(join(repoRoot, "apps/web/.next"))) {
      die("no apps/web/.next; run without --skip-build");
    }
  }

  // 4. Env + services
  const agentEnv = readEnvFile(join(repoRoot, "apps/agent/.env"));
  const webEnv = readEnvFile(join(repoRoot, "apps/web/.env.local"));
  // Web env is for the Next.js client; back-end services should only see
  // agent env (the web env can differ, e.g. devsecret vs secret, and
  // overriding LIVEKIT_API_SECRET from the web env breaks the worker).
  const services = buildServices({ repoRoot, logsDir, agentEnv });
  if (startWeb) services.push(buildWebService({ repoRoot, logsDir, webEnv }));

  // 5. Start + health
  step("starting services");
  const running: RunningService[] = [];
  for (const spec of services) {
    await startService(spec, running);
  }
  ok(`all ${running.length} services up`);

  // 6. Banner
  printBanner(logsDir, services);

  // 7. Cleanup trap + tail logs
  installCleanupTrap(running);
  await tailLogs([join(logsDir, "agent.log"), join(logsDir, "worker.log")]);
}

async function runPreflight(repoRoot: string, startWeb: boolean): Promise<void> {
  const issues: Array<PreflightIssue | PreflightIssue[] | null> = [];

  // Required env files
  issues.push(checkEnvFilePresent(join(repoRoot, "apps/agent/.env"), "agent .env"));
  issues.push(checkEnvFilePresent(join(repoRoot, "apps/web/.env.local"), "web env.local"));

  // Required keys in agent .env
  const agentEnv = readEnvFile(join(repoRoot, "apps/agent/.env"));
  issues.push(
    checkEnvKeys(
      agentEnv,
      [
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "OLLAMA_BASE_URL",
        "OLLAMA_MODEL",
        "WHISPER_BASE_URL",
        "KOKORO_BASE_URL",
      ],
      "apps/agent/.env",
    ),
  );
  issues.push(checkLiveKitKeyPairing(agentEnv, "apps/agent/.env"));

  // Required keys in web .env.local
  const webEnv = readEnvFile(join(repoRoot, "apps/web/.env.local"));
  issues.push(
    checkEnvKeys(
      webEnv,
      ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
      "apps/web/.env.local",
    ),
  );

  // Binaries
  issues.push(
    await checkBinaries([
      { cmd: "uv", resolve: { name: "uv" }, hint: "mise install uv" },
      { cmd: "pnpm", resolve: { name: "pnpm" }, hint: "mise install pnpm" },
      { cmd: "livekit-server", resolve: { name: "livekit-server" }, hint: "brew install livekit" },
      {
        cmd: "parakeet-server",
        resolve: `${process.env.HOME}/bin/parakeet-server`,
        hint: "STT binary; see .agents/docs/stack.md",
      },
      { cmd: "pocket-tts", resolve: { name: "pocket-tts" }, hint: "pipx/uv tool install pocket-tts" },
    ]),
  );

  // Port availability
  const ports = startWeb
    ? [3000, 7880, 8000, 8001, 8089, 8880, 8890]
    : [7880, 8000, 8001, 8089, 8880, 8890];
  issues.push(await checkPortsFree(ports));

  // ui.toml + agent imports
  const uiToml = await checkUiToml(join(repoRoot, "apps/agent"));
  issues.push(uiToml.errors);
  issues.push(uiToml.warnings);

  // Print + decide
  const report = rollup(issues);
  for (const w of report.warnings) warn(w.message);
  for (const e of report.errors) {
    // Each error already starts with the source label
    process.stderr.write(`${RED}  error:${NC} ${e.message}\n`);
  }
  if (!report.ok) {
    die("preflight failed");
  }
  ok(
    `preflight ok (${uiToml.summary.languages} languages, ${uiToml.summary.voiced} voiced)`,
  );
}

async function startService(
  spec: ServiceSpec,
  running: RunningService[],
): Promise<void> {
  step(`starting ${spec.label} (:${spec.port ?? "?"})`);
  const out = (() => {
    // We use Node's fs.openSync via stdio so we can ftruncate on each run.
    const fs = require("node:fs") as typeof import("node:fs");
    return fs.openSync(spec.logFile, "w");
  })();
  const proc = spawn(spec.cmd, [...spec.args], {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env ?? {}) },
    stdio: ["ignore", out, out],
    detached: false,
  });
  running.push({ spec, proc });
  proc.once("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(
        `${RED}  ${spec.name} exited code=${code} signal=${signal}${NC}\n`,
      );
    }
  });

  if (spec.healthCheck) {
    await waitForHealthy(spec);
  } else {
    // No health check (e.g. STT): give the binary a moment to bind.
    await sleep(3000);
    ok(`${spec.name} launched (see ${spec.logFile})`);
  }
}

async function waitForHealthy(spec: ServiceSpec): Promise<void> {
  const hc = spec.healthCheck;
  if (!hc) return;
  if (hc.kind === "http") {
    const interval = hc.intervalMs ?? 1000;
    for (let i = 0; i < hc.attempts; i++) {
      try {
        const res = await fetch(hc.url, { method: "GET" });
        if (res.ok) {
          ok(`${spec.name} healthy (${hc.url})`);
          return;
        }
      } catch {
        // not ready yet
      }
      await sleep(interval);
    }
    die(`${spec.name} did not become healthy at ${hc.url} (see ${spec.logFile})`);
  }
  if (hc.kind === "log") {
    const interval = hc.intervalMs ?? 1000;
    const deadline = Date.now() + hc.timeoutMs;
    while (Date.now() < deadline) {
      let text = "";
      try {
        text = readFileSync(spec.logFile, "utf8");
      } catch {
        text = "";
      }
      if (hc.failOn && hc.failOn.test(text)) {
        die(`${spec.name} failed: matched failOn pattern in ${spec.logFile}`);
      }
      if (text.includes(hc.match)) {
        ok(`${spec.name} registered`);
        return;
      }
      await sleep(interval);
    }
    die(
      `${spec.name} did not match '${hc.match}' in ${spec.logFile} ` +
        `within ${hc.timeoutMs}ms`,
    );
  }
}

function printBanner(logsDir: string, services: readonly ServiceSpec[]): void {
  const summary = services
    .map((s) => `${s.name}:${s.port ?? "?"}`)
    .join(" ");
  process.stdout.write(
    [
      "",
      `  ${GREEN}DeepInterview local prod is running${NC}`,
      "",
      `  web        http://localhost:3000        (logs: ${logsDir}/web.log)`,
      `  agent API  http://127.0.0.1:8000/health (logs: ${logsDir}/agent.log)`,
      `  livekit    :7880   worker :8089         (logs: livekit.log / worker.log)`,
      `  stt :8001  tts :8880  shim :8890       (logs: stt.log / tts.log / tts-shim.log)`,
      "",
      `  ${summary}`,
      "",
      "  Ctrl-C stops everything.",
      "",
    ].join("\n"),
  );
}

function installCleanupTrap(running: RunningService[]): void {
  const cleanup = () => {
    process.stdout.write(`\n${CYAN}==> shutting down${NC}\n`);
    for (const r of running) {
      if (!r.proc.killed && r.proc.exitCode === null) {
        try {
          r.proc.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
    }
    // Give them a moment to exit cleanly, then SIGKILL stragglers.
    setTimeout(() => {
      for (const r of running) {
        if (r.proc.exitCode === null) {
          try {
            r.proc.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
      }
      process.exit(0);
    }, 2000).unref();
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function tailLogs(files: readonly string[]): Promise<void> {
  // Mirror `tail -f agent.log worker.log`. We open each file, watch it,
  // and stream new bytes to stdout until the process is killed.
  const handles = files.map((f) => ({
    file: f,
    pos: 0,
    watcher: watch(f, { persistent: false }, () => undefined),
  }));
  // Print existing content first (so the user sees startup logs immediately).
  for (const h of handles) {
    try {
      const text = readFileSync(h.file, "utf8");
      process.stdout.write(`\n===== ${h.file} =====\n${text}`);
      h.pos = text.length;
    } catch {
      h.pos = 0;
    }
  }
  for (const h of handles) {
    h.watcher.on("change", () => {
      try {
        const text = readFileSync(h.file, "utf8");
        if (text.length > h.pos) {
          process.stdout.write(text.slice(h.pos));
          h.pos = text.length;
        }
      } catch {
        // file truncated or rotated; reset
        h.pos = 0;
      }
    });
  }
  // Block forever; SIGINT triggers cleanup and exits.
  await new Promise<void>(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

export { which };
