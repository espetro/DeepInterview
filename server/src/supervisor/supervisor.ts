import { Server } from "bun";

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
}

export class Supervisor {
  private managed = new Map<ChildName, ManagedChild>();
  private stopping = false;

  constructor(
    private specs: ChildSpec[],
    private opts: { restartLimit?: number; pollMs?: number } = {},
  ) {}

  start(): void {
    for (const spec of this.specs) this.spawn(spec);
    const poll = setInterval(() => void this.poll(), this.opts.pollMs ?? 3000);
    poll.unref?.();
  }

  private spawn(spec: ChildSpec): void {
    console.log(`[supervisor] spawning ${spec.name}: ${spec.command.join(" ")}`);
    const proc = Bun.spawn({
      cmd: spec.command,
      env: spec.env ? { ...process.env, ...spec.env } : undefined,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "ignore",
    });
    proc.exited.then((code) => {
      if (!this.stopping && code !== 0) {
        const m = this.managed.get(spec.name);
        const limit = this.opts.restartLimit ?? 5;
        if (m && m.restarts < limit) {
          m.restarts++;
          console.warn(
            `[supervisor] ${spec.name} exited (${code}), restart ${m.restarts}/${limit}`,
          );
          this.spawn(spec);
        } else {
          console.error(`[supervisor] ${spec.name} exceeded restart limit; giving up`);
        }
      }
    });
    this.managed.set(spec.name, { spec, proc, restarts: 0 });
  }

  private async poll(): Promise<void> {
    for (const m of this.managed.values()) {
      if (!(await m.spec.healthy())) {
        console.warn(`[supervisor] ${m.spec.name} health check failed; killing for restart`);
        m.proc.kill();
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

  async stop(): Promise<void> {
    this.stopping = true;
    for (const m of this.managed.values()) {
      m.proc.kill();
    }
    await Promise.allSettled(
      [...this.managed.values()].map((m) => m.proc.exited),
    );
  }
}
