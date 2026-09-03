/**
 * Preflight checks for the local-prod launcher.
 *
 * Each function returns a structured result instead of throwing so the
 * orchestrator can render consistent banners. Functions that shell out to
 * `uv` / Python stay async; pure-string helpers stay sync so they're easy
 * to unit-test with vitest.
 *
 * Why split this out: the bash version tangled env-file parsing, port
 * checks, Python validation and LiveKit key pairing in one file. Keeping
 * each as a small testable function lets us add new checks without
 * breaking old ones.
 */

import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "../env-template.js";

export interface PreflightIssue {
  level: "error" | "warning";
  message: string;
}

/**
 * Read a `.env`-style file and return parsed key/value pairs. Returns an
 * empty object if the file doesn't exist (caller decides if that's an
 * error).
 */
export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseEnv(readFileSync(path, "utf8"));
}

export function checkEnvFilePresent(
  path: string,
  label: string,
): PreflightIssue | null {
  if (existsSync(path)) return null;
  return {
    level: "error",
    message: `${path} missing (${label})`,
  };
}

export function checkEnvKeys(
  values: Record<string, string>,
  keys: readonly string[],
  source: string,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const key of keys) {
    const v = values[key];
    if (v === undefined || v === "") {
      issues.push({ level: "error", message: `${source}: ${key} is empty or missing` });
    }
  }
  return issues;
}

/**
 * The dev-mode LiveKit server only accepts the API key/secret pair listed
 * in its `LIVEKIT_KEYS` env. If the agent's `.env` declares a different
 * pair, the worker connects but gets 401. Match the bash version's logic.
 */
export function checkLiveKitKeyPairing(
  env: Record<string, string>,
  source: string,
): PreflightIssue | null {
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const keysLine = env.LIVEKIT_KEYS;
  if (!keysLine) {
    return {
      level: "warning",
      message:
        `${source}: LIVEKIT_KEYS not set; livekit-server needs ` +
        `'LIVEKIT_KEYS="<key>: <secret>"' to accept the worker (401 otherwise)`,
    };
  }
  if (!apiKey || !apiSecret) return null; // already reported by checkEnvKeys
  const required = `${apiKey}: ${apiSecret}`;
  if (!keysLine.includes(required)) {
    return {
      level: "error",
      message:
        `${source}: LIVEKIT_KEYS does not grant LIVEKIT_API_KEY/API_SECRET; ` +
        `server will reject the worker with 401`,
    };
  }
  return null;
}

/**
 * Try to bind each port from `host`. Any failure means it's in use.
 * `host: "127.0.0.1"` keeps us from accidentally probing the LAN.
 */
export async function checkPortsFree(
  ports: readonly number[],
  host = "127.0.0.1",
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  await Promise.all(
    ports.map(async (port) => {
      const net = await import("node:net");
      const ok = await new Promise<boolean>((resolve) => {
        const srv = net.createServer();
        srv.unref();
        srv.once("error", () => resolve(false));
        srv.once("listening", () => srv.close(() => resolve(true)));
        srv.listen(port, host);
      });
      if (!ok) {
        issues.push({
          level: "error",
          message: `port ${port} is already in use; stop the stale process first`,
        });
      }
    }),
  );
  return issues;
}

/**
 * Cross-platform `which` — returns the absolute path of `cmd` if found,
 * null otherwise. `which -p` on macOS / `command -v` on Linux.
 */
export async function which(cmd: string): Promise<string | null> {
  try {
    const zx = await import("zx");
    const result = await zx.$({ nothrow: true })`command -v ${cmd}`;
    const out = result.stdout.toString().trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export interface BinaryCheck {
  cmd: string;
  /** Either an absolute path (must be executable) or a bare name resolved via PATH. */
  resolve: string | { name: string };
  /** Human-readable install hint shown when missing. */
  hint: string;
}

export async function checkBinaries(
  checks: readonly BinaryCheck[],
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const fs = await import("node:fs");
  for (const c of checks) {
    const path =
      typeof c.resolve === "string"
        ? c.resolve
        : await which(c.resolve.name);
    if (!path || !existsSync(path)) {
      issues.push({ level: "error", message: `${c.cmd} not found (${c.hint})` });
      continue;
    }
    try {
      fs.accessSync(path, fs.constants.X_OK);
    } catch {
      issues.push({ level: "error", message: `${c.cmd} at ${path} is not executable` });
    }
  }
  return issues;
}

export interface UiTomlSummary {
  languages: number;
  voiced: number;
  unvoiced: string[];
  /** True when 'en' is offered AND has a voice section. */
  enOk: boolean;
}

export interface UiTomlCheckResult {
  ok: boolean;
  summary: UiTomlSummary;
  warnings: PreflightIssue[];
  errors: PreflightIssue[];
}

/**
 * Validate `apps/agent/config/ui.toml` by invoking the agent's own
 * loader. We write the script to a tmp file and run it via `uv run
 * python <tmpfile>` — avoids argument-quoting / stdin issues that come
 * from embedding a multi-line script in a shell template.
 */
export async function checkUiToml(agentCwd: string): Promise<UiTomlCheckResult> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const pathMod = await import("node:path");
  const zx = await import("zx");
  const tmp = pathMod.join(
    os.tmpdir(),
    `di-uitoml-${process.pid}-${Date.now()}.py`,
  );
  const script = [
    "from deepinterview_agent.core.ui_config import get_ui_config",
    "cfg = get_ui_config()",
    'unvoiced = [str(l) for l in cfg.languages if l not in cfg.voices]',
    'print(f"LANGUAGES={len(cfg.languages)}")',
    'print(f"VOICED={len(cfg.voices)}")',
    "joined = ','.join(unvoiced)",
    'print(f"UNVOICED={joined}")',
    'en_ok = "yes" if ("en" in cfg.languages and "en" in cfg.voices) else "no"',
    'print(f"EN_OK={en_ok}")',
    "",
  ].join("\n");
  fs.writeFileSync(tmp, script);
  let result;
  try {
    result = await zx.$({ cwd: agentCwd, nothrow: true })`uv run python ${tmp}`;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best effort */
    }
  }
  const stdout = result.stdout.toString();
  if (result.exitCode !== 0) {
    return {
      ok: false,
      summary: { languages: 0, voiced: 0, unvoiced: [], enOk: false },
      warnings: [],
      errors: [
        {
          level: "error",
          message:
            `ui.toml validation failed:\n${stdout}\n${result.stderr.toString()}`,
        },
      ],
    };
  }
  const get = (key: string) => {
    const line = stdout
      .split("\n")
      .find((l: string) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1) : "";
  };
  const languages = parseInt(get("LANGUAGES"), 10) || 0;
  const voiced = parseInt(get("VOICED"), 10) || 0;
  const unvoiced = get("UNVOICED").split(",").filter(Boolean);
  const enOk = get("EN_OK") === "yes";
  const errors: PreflightIssue[] = [];
  if (!enOk) {
    errors.push({
      level: "error",
      message: "ui.toml: 'en' must be offered AND have a [voices.en] section",
    });
  }
  const warnings: PreflightIssue[] = [];
  if (unvoiced.length > 0) {
    warnings.push({
      level: "warning",
      message:
        `ui.toml: offered languages without [voices.*]: ${unvoiced.join(", ")} ` +
        "(form falls back to the default voice)",
    });
  }
  return {
    ok: errors.length === 0,
    summary: { languages, voiced, unvoiced, enOk },
    warnings,
    errors,
  };
}

/**
 * Final rollup: collect every issue, surface counts, decide pass/fail.
 */
export interface PreflightReport {
  ok: boolean;
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
}

export function rollup(
  checks: Iterable<PreflightIssue | PreflightIssue[] | null>,
): PreflightReport {
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];
  for (const c of checks) {
    if (!c) continue;
    const list = Array.isArray(c) ? c : [c];
    for (const i of list) {
      if (i.level === "error") errors.push(i);
      else warnings.push(i);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
