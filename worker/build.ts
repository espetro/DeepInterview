import * as esbuild from "esbuild";

const outdir = ".";
const outfile = "worker.js";

// The agents-js ProcPool forks job child processes from
// `./job_proc_lazy_main.js` resolved next to the bundled worker file; the
// child then dynamic-imports the agent entry (argv[2]) and speaks the agents
// IPC protocol. Bundle the published dist file as its own entry so all its
// imports are inlined and it runs standalone next to worker.js.
await esbuild.build({
  entryPoints: {
    "worker": "src/entry.ts",
    "agent": "src/agent-main.ts",
    "job_proc_lazy_main": "node_modules/@livekit/agents/dist/ipc/job_proc_lazy_main.js",
  },
  outdir,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "bundle",
  external: [
    // Native .node binaries must resolve from node_modules at runtime.
    // rtc-ffi-bindings (pulled in by @livekit/rtc-node) and onnxruntime-node
    // (silero VAD) both load platform-specific .node files.
    "onnxruntime-node",
    "@livekit/rtc-ffi-bindings",
    "@livekit/rtc-ffi-bindings-darwin-arm64",
    "@livekit/rtc-ffi-bindings-darwin-x64",
    "@livekit/rtc-ffi-bindings-linux-arm64",
    "@livekit/rtc-ffi-bindings-linux-x64",
  ],
  sourcemap: true,
  logLevel: "info",
  banner: {
    js: [
      "import { createRequire as __diCr } from 'node:module';",
      "import __diPath from 'node:path';",
      "import { fileURLToPath as __diF2p } from 'node:url';",
      "const require = __diCr(import.meta.url);",
      "const __filename = __diF2p(import.meta.url);",
      "const __dirname = __diPath.dirname(__filename);",
    ].join("\n"),
  },
});

console.log(`built worker.js, agent.js, job_proc_lazy_main.js`);

// silero VAD resolves its model relative to import.meta.url; copy it next to
// the bundles so agent prewarm can load it in bundled mode.
await (async () => {
  const { copyFile } = await import("node:fs/promises");
  await copyFile(
    "node_modules/@livekit/agents-plugin-silero/dist/silero_vad.onnx",
    "silero_vad.onnx",
  );
})();
