/**
 * The server the browser tests run against: the REAL API and the REAL
 * production build of the site, on one port, with a fresh database, the
 * sandbox payment provider, and rate limiting off.
 *
 *   tsx scripts/e2e-server.ts
 */
import { rmSync } from 'node:fs'

const dataDir = './data/e2e'
rmSync(dataDir, { recursive: true, force: true })

Object.assign(process.env, {
  FRAMENGINE_ENV: 'test',
  PORT: process.env.PORT ?? '4173',
  HOST: '127.0.0.1',
  DATABASE_URL: `file:${dataDir}/e2e.db`,
  UPLOADS_DIR: `${dataDir}/uploads`,
  PACKAGES_DIR: `${dataDir}/packages`,
  STATIC_DIR: './dist',
  PAYMENT_PROVIDER: 'sandbox',
  SANDBOX_WEBHOOK_SECRET: 'e2e-sandbox-secret',
  RATE_LIMIT: 'off',
  WHATSAPP_NUMBER: '910000000000',
})

await import('../server/index.ts')
