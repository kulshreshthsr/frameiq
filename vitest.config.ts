import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const appVersion = (JSON.parse(readFileSync('./frontend/package.json', 'utf8')) as { version: string }).version

/**
 * The unified test run — frontend, `shared/` and backend in one command
 * (`npm test`), unchanged from before the frontend/backend split. It's
 * separate from `frontend/vite.config.ts` (which only builds/serves the
 * app) because it spans all three; `frontend/`'s own build config has no
 * reason to know about `backend/server`.
 *
 * jsdom is the default environment; backend test files that need real Node
 * behaviour opt out per-file with a `// @vitest-environment node` pragma
 * (see e.g. server/config.test.ts) rather than this config picking sides.
 */
export default defineConfig({
  plugins: [react()],
  // Read by src/checkout/flow.ts (recorded in every order snapshot); matches
  // the same define in frontend/vite.config.ts so a test sees the real value.
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  test: {
    environment: 'jsdom',
    setupFiles: ['./frontend/src/test/setup.ts'],
    include: ['frontend/src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'backend/server/**/*.test.ts'],
    css: false,
  },
})
