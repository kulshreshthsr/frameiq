import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { buildContext } from './bootstrap.ts'
import { ConfigError, loadConfig } from './config.ts'
import { loadEnvFile } from './env.ts'
import { processOutbox } from './notifications/notifier.ts'

/**
 * Starts the server: loads `.env` (real environment variables win), checks
 * the configuration — refusing to run if it is unsafe for the environment —
 * builds the services, and listens.
 */
async function main() {
  loadEnvFile()
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const ctx = await buildContext(config)
  const app = createApp(ctx)

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    ctx.log.event('server.started', {
      env: config.env,
      port: info.port,
      payments: ctx.payments.name,
      static: config.staticDir ?? 'none',
    })
  })

  // Deliver queued customer messages every so often (and once at start).
  const pump = () => processOutbox(ctx).catch((error) => ctx.log.error('outbox.failed', { message: String(error?.message ?? error) }))
  void pump()
  const timer = setInterval(pump, 30_000)

  const shutdown = (signal: string) => {
    ctx.log.event('server.stopping', { signal })
    clearInterval(timer)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error) => {
  console.error('Server failed to start:', error instanceof Error ? error.message : error)
  process.exit(1)
})
