import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/run-local-prod.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  fixedExtension: false,
  banner: { js: '#!/usr/bin/env node' },
})
