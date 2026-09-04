/**
 * Release archive builder. Produces dist/releases/di-<version>-<target>.tar.gz
 * containing:
 *   di                       compiled binary (bun build --compile)
 *   worker/worker.js         esbuild bundle of the voice-agent worker
 *   worker/node_modules/     native-only deps the worker bundle requires at runtime
 *   web/dist/client/         SPA assets
 *   config.example.yaml      reference config
 *   install.sh               first-run installer (also curl-able standalone)
 *   README.md                archive-specific quickstart
 *
 * Usage: bun run build/release.ts [--target <bun-target>]...
 * Targets default to the full matrix (see TARGETS). Cross-compilation happens
 * on the host via --target; no VMs needed.
 */
import { parseArgs } from "node:util";
import { $ } from "bun";
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "dist", "releases");

const TARGETS = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-arm64",
  "bun-darwin-x64",
] as const;

type Target = (typeof TARGETS)[number];

const TRIPLES: Record<Target, string> = {
  "bun-linux-x64": "linux-x64",
  "bun-linux-arm64": "linux-arm64",
  "bun-darwin-arm64": "darwin-arm64",
  "bun-darwin-x64": "darwin-x64",
};

// Platform of each target: linux archives ship linux native deps, etc.
function targetPlatform(t: Target): "linux" | "darwin" {
  return t.startsWith("bun-linux") ? "linux" : "darwin";
}

function targetArch(t: Target): "x64" | "arm64" {
  return t.includes("arm64") ? "arm64" : "x64";
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    target: { type: "string", multiple: true },
    version: { type: "string" },
  },
});

const version =
  values.version ??
  process.env.DI_VERSION ??
  (await $`git -C ${ROOT} describe --tags --always --dirty`.quiet().text()).trim();

const targets = (values.target?.length ? values.target : [...TARGETS]) as Target[];
for (const t of targets) {
  if (!TARGETS.includes(t)) {
    console.error(`unknown target: ${t} (valid: ${TARGETS.join(", ")})`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Prerequisites: web SPA + worker bundle (mise run build does both).
// ---------------------------------------------------------------------------
const spaDir = join(ROOT, "web", "dist", "client");
const workerJs = join(ROOT, "worker", "worker.js");
if (!existsSync(join(spaDir, "index.html")) || !existsSync(workerJs)) {
  console.error("missing build artifacts; run `mise run build` first");
  process.exit(1);
}

// Worker bundle is standalone JS except for native modules: onnxruntime-node
// (silero VAD) and @livekit/rtc-ffi-bindings (RTC) load platform-specific
// .node binaries at runtime, and sharp resolves its per-platform @img/* packages
// dynamically. Ship the worker's node_modules pruned to those packages plus
// their transitive deps, scoped to the archive's platform.
const NATIVE_PKGS = ["onnxruntime-node", "@livekit/rtc-ffi-bindings", "sharp"];

async function collectNativeDeps(target: Target): Promise<string[]> {
  const platform = targetPlatform(target);
  const arch = targetArch(target);
  const pkgs = new Set<string>(NATIVE_PKGS);
  const workerNodeModules = join(ROOT, "worker", "node_modules");

  // Walk package.json deps of the native roots to include transitive runtime
  // deps (e.g. onnxruntime-common, @mapbox/node-pre-gyp style loaders).
  async function visit(name: string, from?: string) {
    // Under bun's isolated linker a dep's transitive deps are siblings in the
    // store entry dir: .bun/<pkg>@<v>/node_modules/<dep>.
    const bases = from
      ? [from]
      : [join(workerNodeModules, name), join(ROOT, "node_modules", name)];
    for (const base of bases) {
      const dir = existsSync(join(base, "package.json"))
        ? base
        : join(ROOT, "node_modules", ".bun", `${name}@`, "node_modules", name);
      const pjPath = join(dir, "package.json");
      if (!existsSync(pjPath)) continue;
      try {
        const pj = JSON.parse(await Bun.file(pjPath).text()) as { dependencies?: Record<string, string> };
        for (const dep of Object.keys(pj.dependencies ?? {})) {
          if (!pkgs.has(dep)) {
            pkgs.add(dep);
            await visit(dep, join(dir, ".."));
          }
        }
      } catch {
        // ignore malformed package.json
      }
      break;
    }
  }
  for (const p of NATIVE_PKGS) await visit(p);

  // Platform-specific optional deps of sharp (@img/sharp-<platform>-<arch>).
  pkgs.add(`@img/sharp-${platform}-${arch}`);
  pkgs.add(`@img/sharp-libvips-${platform}-${arch}`);
  pkgs.add(`@livekit/rtc-ffi-bindings-${platform}-${arch}`);
  return [...pkgs];
}

// ---------------------------------------------------------------------------
// Installer + README generated per archive.
// ---------------------------------------------------------------------------
const installer = `#!/bin/sh
# deep-interview runtime installer. Installs bun (if needed) plus the platform
# native runtime bits that cannot be bundled (livekit-server SFU binary).
set -e

have() { command -v "$1" >/dev/null 2>&1; }

# 1. Runtime: bun (preferred) or node >= 22 for the worker.
if have bun; then
  echo "[install] bun found: \$(bun --version)"
elif have node; then
  major=\$(node -p 'process.versions.node.split(".")[0]')
  if [ "\$major" -lt 22 ]; then
    echo "[install] node >= 22 required (found \$major); installing bun instead" >&2
    curl -fsSL https://bun.sh/install | bash
  else
    echo "[install] node found: \$(node --version)"
  fi
else
  echo "[install] no runtime found; installing bun" >&2
  curl -fsSL https://bun.sh/install | bash
fi

# 2. livekit-server (SFU) on PATH, unless already present or DI_EXTERNAL_SFU=1.
if have livekit-server; then
  echo "[install] livekit-server found: \$(livekit-server --version 2>/dev/null || echo unknown)"
elif [ "\${DI_EXTERNAL_SFU:-0}" = "1" ]; then
  echo "[install] DI_EXTERNAL_SFU=1: skipping livekit-server install"
else
  echo "[install] livekit-server not found on PATH." >&2
  echo "          Install it from https://github.com/livekit/livekit/releases" >&2
  echo "          or set DI_EXTERNAL_SFU=1 to use an external SFU." >&2
fi

echo "[install] done. Next: cp config.example.yaml config.yaml, edit it, then run ./di --config config.yaml"
`;

const readme = (target: Target) => `# deep-interview ${version} (${TRIPLES[target]})

Self-contained distribution: compiled \`di\` server binary, voice-agent worker
bundle, and web SPA.

## Layout
- \`di\`                      server binary (also the CLI)
- \`worker/worker.js\`        voice-agent worker bundle
- \`worker/node_modules/\`    native-only runtime deps (onnxruntime, rtc-ffi, sharp)
- \`web/dist/client/\`        SPA assets (served by \`di\`)
- \`config.example.yaml\`     reference configuration
- \`install.sh\`              runtime installer (bun/node check, SFU hints)

## Quickstart
    ./install.sh
    cp config.example.yaml config.yaml   # then edit for your providers
    ./di --config config.yaml --check    # validate the stack
    ./di --config config.yaml            # serve (spawns worker + livekit)

\`di --check\` verifies: config parses, sqlite is writable, web assets and the
worker bundle are present, and each provider endpoint responds.

## Notes
- The worker runs under \`node\` (>= 22) or \`bun\`; \`di\` picks whichever is on PATH.
- \`livekit-server\` is not bundled; install it separately (see install.sh) or run
  your own SFU and point \`livekit.url\` in the config at it.
`;

// ---------------------------------------------------------------------------
// Per-target staging + archive.
// ---------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });

for (const target of targets) {
  const triple = TRIPLES[target];
  const stage = join(OUT, `di-${version}-${triple}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  console.log(`==> compiling di for ${target}`);
  const binTmp = join(stage, "di.bin");
  await $`bun build --compile --target ${target} ${join(ROOT, "server", "src", "cli.ts")} --outfile ${binTmp}`;

  await $`mv ${binTmp} ${join(stage, "di")}`;
  await $`chmod +x ${join(stage, "di")}`;

  console.log(`==> staging web assets + worker`);
  cpSync(spaDir, join(stage, "web", "dist", "client"), { recursive: true });
  mkdirSync(join(stage, "worker"), { recursive: true });
  cpSync(workerJs, join(stage, "worker", "worker.js"));

  console.log(`==> staging native worker deps (${triple})`);
  const workerNM = join(ROOT, "worker", "node_modules");
  const rootNM = join(ROOT, "node_modules");
  const stageNM = join(stage, "worker", "node_modules");

  // pkg -> store entry dir (the .bun/<pkg>@<v>/node_modules/<pkg> parent), used
  // to resolve that package's own transitive deps as nested node_modules.
  const storeParents = new Map<string, string>();

  const storeEntry = (pkg: string): string | null => {
    // bun isolated linker store: node_modules/.bun/<pkg>@<version>/node_modules/<pkg>
    const storeRoot = join(ROOT, "node_modules", ".bun");
    if (!existsSync(storeRoot)) return null;
    const scope = dirname(pkg); // "" or "@scope"
    const name = basename(pkg);
    const scopeDir = scope.startsWith("@") ? join(storeRoot, scope) : storeRoot;
    if (!existsSync(scopeDir)) return null;
    for (const entry of readdirSync(scopeDir)) {
      if (!entry.startsWith(`${name}@`)) continue;
      const candidate = join(scopeDir, entry, "node_modules", pkg);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  };

  for (const pkg of await collectNativeDeps(target)) {
    let staged = false;
    for (const nm of [workerNM, rootNM]) {
      const src = join(nm, pkg);
      if (!existsSync(src)) continue;
      await $`mkdir -p ${join(stageNM, pkg)} && cp -R -L ${src}/ ${join(stageNM, pkg)}/`;
      storeParents.set(pkg, dirname(realpathSync(src)));
      staged = true;
      break;
    }
    if (!staged) {
      const storeSrc = storeEntry(pkg);
      if (storeSrc) {
        await $`mkdir -p ${join(stageNM, pkg)} && cp -R -L ${storeSrc}/ ${join(stageNM, pkg)}/`;
        storeParents.set(pkg, dirname(storeSrc));
        staged = true;
      }
    }
    if (!staged) console.warn(`    [warn] native dep not found: ${pkg}`);
  }

  // Nested resolution: each staged package gets a node_modules dir containing
  // its sibling deps from the enclosing node_modules root (real files, not
  // symlinks), so requires like '@livekit/rtc-ffi-bindings-darwin-arm64'
  // resolve inside the archive. Scoped entries keep their @scope folder.
  for (const [pkg, parent] of storeParents) {
    const segs = parent.split(sep);
    const nmi = segs.lastIndexOf("node_modules");
    const nmRoot = nmi >= 0 ? segs.slice(0, nmi + 1).join(sep) : parent;
    for (const entry of readdirSync(nmRoot)) {
      const srcE = join(nmRoot, entry);
      if (entry.startsWith("@")) {
        for (const inner of readdirSync(srcE)) {
          if (join(entry, inner) === pkg) continue;
          const dest = join(stageNM, pkg, "node_modules", entry, inner);
          await $`mkdir -p ${dirname(dest)} && cp -R -L ${join(srcE, inner)}/ ${dest}/`;
        }
      } else {
        if (entry === pkg) continue;
        const dest = join(stageNM, pkg, "node_modules", entry);
        await $`mkdir -p ${dirname(dest)} && cp -R -L ${srcE}/ ${dest}/`;
      }
    }
  }

  console.log(`==> staging config, installer, README`);
  cpSync(join(ROOT, "config.example.yaml"), join(stage, "config.example.yaml"));
  writeFileSync(join(stage, "install.sh"), installer, { mode: 0o755 });
  writeFileSync(join(stage, "README.md"), readme(target));

  const archive = join(OUT, `di-${version}-${triple}.tar.gz`);
  console.log(`==> archiving ${archive}`);
  await $`tar -czf ${archive} -C ${OUT} ${`di-${version}-${triple}`}`;
  rmSync(stage, { recursive: true });
}

console.log(`\nrelease archives in ${OUT}:`);
for (const target of targets) {
  const p = join(OUT, `di-${version}-${TRIPLES[target]}.tar.gz`);
  const f = Bun.file(p);
  if (await f.exists()) console.log(`  ${p} (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
}
