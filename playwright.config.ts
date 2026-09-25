import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * End-to-end tests run against the PRODUCTION build served by the real
 * backend, so what is tested is what a customer receives — including the fact
 * that developer tools aren't in it, and that orders really go through the API.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  fullyParallel: true,
  retries: 1,
  workers: 2,
  reporter: [['list']],
  // Baselines are per project (device size); the name carries no OS suffix so
  // they stay valid on any machine that renders the same way.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Downloads are how "Save image" delivers.
    acceptDownloads: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'mobile',
      // A modern phone (390×844), driven through Chromium with touch enabled.
      use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium', viewport: { width: 820, height: 1180 } },
    },
  ],
  // The REAL server — API, database, sandbox payments — serving the REAL
  // production build, with a fresh database each run (see scripts/e2e-server.ts).
  webServer: {
    command: 'npm run build && npx tsx scripts/e2e-server.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
