/**
 * Service specs for the local-prod launcher.
 *
 * Each service is a declarative description of how to spawn it, where to
 * log to, and how to know it's ready. The orchestrator doesn't need to
 * know what livekit-server vs. parakeet vs. pocket-tts are — it just
 * walks the array.
 */

export type ServiceName =
  | "livekit"
  | "stt"
  | "tts"
  | "tts-shim"
  | "agent"
  | "worker"
  | "web";

export interface HttpHealthCheck {
  kind: "http";
  url: string;
  /** Total attempts before giving up. */
  attempts: number;
  /** Delay between attempts in ms. */
  intervalMs?: number;
}

export interface LogReadyCheck {
  kind: "log";
  /** Substring that must appear in the log file. */
  match: string;
  /** Time to keep polling the log for `match` before giving up. */
  timeoutMs: number;
  /** Log polling interval in ms. */
  intervalMs?: number;
  /** Pattern that, if seen, means the service crashed. */
  failOn?: RegExp;
}

export type HealthCheck = HttpHealthCheck | LogReadyCheck;

export interface ServiceSpec {
  name: ServiceName;
  /** What to print when we start it. */
  label: string;
  /** Bare command name (resolved via PATH). */
  cmd: string;
  /** Args. Quoting handled by zx. */
  args: readonly string[];
  /** Working directory. Defaults to repo root. */
  cwd?: string;
  /** Extra env vars to merge onto the inherited environment. */
  env?: Record<string, string>;
  /** Port this service listens on (purely informational; included in banner). */
  port?: number;
  /** File to write combined stdout+stderr into. Path is absolute. */
  logFile: string;
  /** Health check the orchestrator waits on before printing the banner. */
  healthCheck?: HealthCheck;
}

/**
 * Build the service array. `logsDir` must already exist; log files inside
 * it get truncated by the orchestrator before services start.
 */
export function buildServices(opts: {
  repoRoot: string;
  logsDir: string;
  agentEnv: Record<string, string>;
}): ServiceSpec[] {
  const { repoRoot, logsDir, agentEnv } = opts;
  const env = { ...process.env, ...agentEnv } as Record<string, string>;
  const log = (name: string) => `${logsDir}/${name}.log`;
  return [
    {
      name: "livekit",
      label: "LiveKit server",
      cmd: "livekit-server",
      args: ["--dev", "--bind", "127.0.0.1"],
      env,
      port: 7880,
      logFile: log("livekit"),
      healthCheck: {
        kind: "http",
        url: "http://127.0.0.1:7880",
        attempts: 20,
        intervalMs: 1000,
      },
    },
    {
      name: "stt",
      label: "parakeet STT",
      cmd: `${process.env.HOME}/bin/parakeet-server`,
      args: [
        "--model",
        "tdt_ctc-110m-q4_k",
        "--host",
        "127.0.0.1",
        "--port",
        "8001",
      ],
      env,
      port: 8001,
      logFile: log("stt"),
      // parakeet has no HTTP health endpoint; the launcher sleeps instead.
    },
    {
      name: "tts",
      label: "pocket-tts",
      cmd: "pocket-tts",
      args: ["serve", "--host", "127.0.0.1", "--port", "8880", "--quantize"],
      env,
      port: 8880,
      logFile: log("tts"),
    },
    {
      name: "tts-shim",
      label: "pocket-tts openai-compat shim",
      cmd: "uv",
      args: [
        "run",
        "--with",
        "fastapi",
        "--with",
        "httpx",
        "--with",
        "uvicorn",
        "python",
        "scripts/pocket-tts-shim.py",
      ],
      cwd: repoRoot,
      env,
      port: 8890,
      logFile: log("tts-shim"),
    },
    {
      name: "agent",
      label: "agent FastAPI",
      cmd: "uv",
      args: [
        "run",
        "uvicorn",
        "deepinterview_agent.app:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
      ],
      cwd: `${repoRoot}/apps/agent`,
      env,
      port: 8000,
      logFile: log("agent"),
      healthCheck: {
        kind: "http",
        url: "http://127.0.0.1:8000/health",
        attempts: 60,
        intervalMs: 1000,
      },
    },
    {
      name: "worker",
      label: "LiveKit worker",
      cmd: "uv",
      args: [
        "run",
        "python",
        "-m",
        "deepinterview_agent.run_local_worker",
        "start",
      ],
      cwd: `${repoRoot}/apps/agent`,
      env,
      port: 8089,
      logFile: log("worker"),
      healthCheck: {
        kind: "log",
        match: "registered worker",
        timeoutMs: 20_000,
        intervalMs: 1000,
        failOn: /401|unauthorized|failed to connect/i,
      },
    },
  ];
}

/** The web service is opt-in (skipped under --no-web). */
export function buildWebService(opts: {
  repoRoot: string;
  logsDir: string;
  webEnv: Record<string, string>;
}): ServiceSpec {
  const { logsDir, webEnv } = opts;
  return {
    name: "web",
    label: "Next.js prod",
    cmd: "pnpm",
    args: ["exec", "next", "start", "-p", "3000"],
    cwd: `${opts.repoRoot}/apps/web`,
    env: webEnv,
    logFile: `${logsDir}/web.log`,
    port: 3000,
    healthCheck: {
      kind: "http",
      url: "http://127.0.0.1:3000",
      attempts: 60,
      intervalMs: 1000,
    },
  };
}
