import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      // static SPA: prerender all routes, no server runtime needed in the di binary
      prerender: { enabled: true, crawlLinks: true },
    }),
    react(),
    tailwindcss(),
  ],
});
