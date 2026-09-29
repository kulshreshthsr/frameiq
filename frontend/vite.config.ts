import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const appVersion = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version

// https://vite.dev/config/
//
// Test running lives in the root `vitest.config.ts`, not here — it spans
// this app, `shared/` and the backend in one run, so it can't live inside
// just the frontend's own build config.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  // Recorded in every order snapshot, so a problem can be traced to the build that made it.
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    // In development the API runs separately (npm run dev:api); pass /api through.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
