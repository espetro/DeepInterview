import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  server: {
    port: 5199,
    strictPort: true,
    headers: {
      // localhost is a secure context by default; COOP/COEP not needed for
      // OPFS sahpool (it needs no special headers, unlike the old opfs-vfs).
    },
  },
  optimizeDeps: {
    // pre-bundling worker/wasm deps breaks the sqlite-wasm worker import
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: { format: "es" as const },
});
