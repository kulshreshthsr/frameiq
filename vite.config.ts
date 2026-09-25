import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const appVersion = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Recorded in every order snapshot, so a problem can be traced to the build that made it.
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    // In development the API runs separately (npm run dev:api); pass /api through.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    css: false,
  },
})
