import { closeSync, mkdirSync, openSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

const children = ["worker", "sfu"] as const;
export type ChildName = (typeof children)[number];

export interface ChildSpec {
  name: ChildName;
  command: string[];
  /** Extra env vars merged over process.env for the child. */
  env?: Record<string, string>;
  healthy: () => Promise<boolean>;
}

export interface ManagedChild {
  spec: ChildSpec;
  proc: Bun.Subprocess;
  restarts: number;
  startedAt: number;
  logFile: string;
  /** Write-end fd of the log file backing proc stdout/stderr. */
  logFd: number;
}

export interface ChildDetail {
  up: boolean;
  restarts: number;
  uptime_s: number;
  log: string;
}

/**
 * Resolve the per-child log directory:
 *   $DI_LOG_DIR, else <dirname(db_path)>/logs, else <repo root>/.di/logs
 */
export function resolveLogDir(dbPath?: string): string {
  if (process.env.DI_LOG_DIR) return process.env.DI_LOG_DIR;
  if (dbPath) return join(dirname(dbPath), "logs");
  return join(process.cwd(), ".di", "logs");
}

export class Supervisor {
  private managed = new Map<ChildName, ManagedChild>();
  private stopping = false;
  private logDir: string;

  constructor(
    private specs: ChildSpec[],
    private opts: { restartLimit?: number; pollMs?: number; logDir?: string } = {},
  ) {
    this.logDir = opts.logDir ?? resolveLogDir();
  }

  start(): void {
    mkdirSync(this.logDir, { recursive: true });
    for (const spec of this.specs) this.spawn(spec);
    const poll = setInterval(() => void this.poll(), this.opts.pollMs ?? 3000);
    poll.unref?.();
  }

  /** Map of child name -> log file path. */
  logPaths(): Record<ChildName, string> {
    const out = {} as Record<ChildName, string>;
    for (const [name, m] of this.managed) out[name] = m.logFile;
    return out;
  }

  /** Restart a child that exited unexpectedly, honoring the restart limit. */
  private scheduleRestart(spec: ChildSpec, code: number): void {
    const m = this.managed.get(spec.name);
    const limit = this.opts.restartLimit ?? 5;
    if (m && m.restarts < limit) {
      m.restarts++;
      console.warn(
        `[supervisor] ${spec.name} exited (${code}), restart ${m.restarts}/${limit}`,
      );
      this.spawn(spec, true);
    } else {
      console.error(`[supervisor] ${spec.name} exceeded restart limit; giving up`);
    }
  }

  private spawn(spec: ChildSpec, restart = false): void {
    console.log(`[supervisor] spawning ${spec.name}: ${spec.command.join(" ")}`);
    mkdirSync(this.logDir, { recursive: true });
    const logFile = join(this.logDir, `${spec.name}.log`);
    if (restart) {
      // Keep at most one previous log: current -> <name>.log.1 (overwrites).
      try {
        renameSync(logFile, `${logFile}.1`);
      } catch {
        // first restart, nothing to rotate
      }
    }
    const logFd = openSync(logFile, "a");
    const proc = Bun.spawn({
      cmd: spec.command,
      env: spec.env ? { ...process.env, ...spec.env } : undefined,
      stdout: logFd,
      stderr: logFd,
      // Own process group: agents-js job subprocesses are grandchildren of
      // `worker`, so a plain proc.kill() would only signal the immediate
      // child and orphan the rest. `detached` makes this pid its own process
      // group leader; killGroup() below signals the whole group by -pid.
      detached: true,
      // Parent-liveness channel, left open (not ended) for the child's
      // lifetime: the OS closes this pipe automatically if the supervisor
      // dies for any reason, including SIGKILL, delivering EOF to the
      // child's stdin. worker/src/entry.ts's main() exits on that EOF. This
      // is the POSIX-reliable way to guarantee no orphan survives a
      // SIGKILLed supervisor — signals alone can't reach a process that
      // outlived a killed parent before the kill lands.
      stdin: "pipe",
    });
    proc.exited.then((code) => {
      try {
        closeSync(logFd);
      } catch {
        // already closed
      }
      // A signal-killed child can report a clean exit code (livekit-server
      // exits 0 on SIGTERM), so any exit while the supervisor is running is
      // restart-worthy regardless of code.
      if (!this.stopping) this.scheduleRestart(spec, code);
    });
    this.managed.set(spec.name, {
      spec,
      proc,
      restarts: restart ? (this.managed.get(spec.name)?.restarts ?? 0) : 0,
      startedAt: Date.now(),
      logFile,
      logFd,
    });
  }

  private async poll(): Promise<void> {
    for (const m of this.managed.values()) {
      if (!(await m.spec.healthy())) {
        console.warn(`[supervisor] ${m.spec.name} health check failed; killing for restart`);
        killGroup(m.proc);
      }
    }
  }

  async health(): Promise<Record<ChildName, boolean>> {
    const out = {} as Record<ChildName, boolean>;
    for (const [name, m] of this.managed) {
      out[name] = m.proc.exitCode === null && (await m.spec.healthy());
    }
    return out;
  }

  /** Per-child detail; additive alongside health(). */
  async childrenDetail(): Promise<Record<ChildName, ChildDetail>> {
    const out = {} as Record<ChildName, ChildDetail>;
    for (const [name, m] of this.managed) {
      const up = m.proc.exitCode === null && (await m.spec.healthy());
      out[name] = {
        up,
        restarts: m.restarts,
        uptime_s: Math.max(0, Math.round((Date.now() - m.startedAt) / 1000)),
        log: m.logFile,
      };
    }
    return out;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const m of this.managed.values()) {
      killGroup(m.proc);
    }
    await Promise.allSettled(
      [...this.managed.values()].map((m) => m.proc.exited),
    );
  }
}

/**
 * Kill a detached child's whole process group (spawned with pid == pgid via
 * `detached: true`). Falls back to killing just the pid if the group signal
 * fails (e.g. already reaped, or non-POSIX platform).
 */
function killGroup(proc: Bun.Subprocess): void {
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill();
  }
}
