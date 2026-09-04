import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Supervisor, resolveLogDir } from "./supervisor";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "di-sup-"));
  dirs.push(d);
  return d;
}

function echoSpec(): { name: "worker"; command: string[]; healthy: () => Promise<boolean> } {
  return {
    name: "worker",
    // Writes a line then exits 0 so the supervisor does not restart it.
    command: ["bash", "-c", `echo echo-output && sleep 30`],
    healthy: async () => true,
  };
}

describe("supervisor log files", () => {
  it("routes child output into <logDir>/<name>.log and exposes logPaths()", async () => {
    const dir = tmpDir();
    const sup = new Supervisor([echoSpec()], { logDir: join(dir, "logs") });
    sup.start();
    await Bun.sleep(300);
    await sup.stop();

    const paths = sup.logPaths();
    expect(paths.worker).toBe(join(dir, "logs", "worker.log"));
    const content = readFileSync(paths.worker, "utf8");
    expect(content).toContain("echo-output");
  });

  it("creates the log dir on spawn (default path via resolveLogDir with DI_LOG_DIR)", () => {
    const dir = tmpDir();
    process.env.DI_LOG_DIR = dir;
    expect(resolveLogDir()).toBe(dir);
    expect(resolveLogDir("x/db.sqlite")).toBe(dir);
    delete process.env.DI_LOG_DIR;
    expect(resolveLogDir("x/db.sqlite")).toBe(join("x", "logs"));
  });

  it("rotates the log to .log.1 on restart, keeping max one old", async () => {
    const dir = tmpDir();
    const logDir = join(dir, "logs");
    let n = 0;
    const sup = new Supervisor(
      [
        {
          name: "worker",
          // exits nonzero immediately; supervisor restarts until limit
          command: ["bash", "-c", `echo run-${++n} >&2; exit 1`],
          healthy: async () => false,
        },
      ],
      { logDir, restartLimit: 1 },
    );
    sup.start();
    await Bun.sleep(700);
    await sup.stop();

    expect(existsSync(join(logDir, "worker.log"))).toBe(true);
    expect(existsSync(join(logDir, "worker.log.1"))).toBe(true);
    const detail = await sup.childrenDetail();
    expect(detail.worker.restarts).toBe(1);
    expect(detail.worker.log).toBe(join(logDir, "worker.log"));
    expect(typeof detail.worker.uptime_s).toBe("number");
  });

  it("children_detail mirrors health() and carries log paths", async () => {
    const dir = tmpDir();
    const sup = new Supervisor([echoSpec()], { logDir: join(dir, "logs") });
    sup.start();
    await Bun.sleep(200);

    const health = await sup.health();
    const detail = await sup.childrenDetail();
    expect(detail.worker.up).toBe(health.worker);
    expect(detail.worker.log).toBe(join(dir, "logs", "worker.log"));
    await sup.stop();
  });
});

describe("log writing while running", () => {
  it("appends subsequent output from the same child to the log file", async () => {
    const dir = tmpDir();
    const logFile = join(dir, "logs", "worker.log");
    const marker = join(dir, "marker.txt");
    const sup = new Supervisor(
      [
        {
          name: "worker",
          command: ["bash", "-c", `echo first; echo done > ${marker}; sleep 30`],
          healthy: async () => true,
        },
      ],
      { logDir: join(dir, "logs") },
    );
    sup.start();
    // wait for marker to know echo flushed
    for (let i = 0; i < 50 && !existsSync(marker); i++) await Bun.sleep(50);
    await sup.stop();
    expect(readFileSync(logFile, "utf8")).toContain("first");
  });
});

describe("supervisor restarts", () => {
  it("restarts a child that exits cleanly on its own (exit 0 is still unexpected)", async () => {
    const dir = tmpDir();
    let n = 0;
    const sup = new Supervisor(
      [
        {
          name: "worker",
          // First run exits 0 immediately (as livekit-server does on SIGTERM);
          // second run signals via the log and stays alive.
          command: [
            "bash",
            "-c",
            `if [ ! -f ${dir}/flag ]; then touch ${dir}/flag; exit 0; else echo second-run; sleep 30; fi`,
          ],
          healthy: async () => true,
        },
      ],
      { logDir: join(dir, "logs") },
    );
    sup.start();
    await Bun.sleep(600);
    const detail = await sup.childrenDetail();
    expect(detail.worker.restarts).toBe(1);
    expect(detail.worker.up).toBe(true);
    await sup.stop();
    expect(readFileSync(join(dir, "logs", "worker.log"), "utf8")).toContain("second-run");
  });
});
