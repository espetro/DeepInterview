import * as esbuild from "esbuild";

const outdir = ".";
const outfile = "worker.js";

await esbuild.build({
  entryPoints: ["src/entry.ts"],
  outfile,
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

console.log(`built ${outdir}/${outfile}`);
