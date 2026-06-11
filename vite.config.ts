import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// This file configures vitest only. Astro's own pipeline (astro.config.mjs)
// owns the production Rollup output (chunking, sourcemaps, etc.); a
// `build:` block here would be ignored by `astro build`.
export default defineConfig({
  plugins: [react()],
  test: {
    // Pure-function tests run in Node; no DOM required for the P0 test
    // surface (scoring.ts, validation.ts, utils.ts). Switch to 'jsdom' if
    // component tests are added.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
