import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { loadCatalog, publicCatalog } from './catalog/catalogRepo.ts'
import type { AppContext } from './context.ts'
import { AppError, errors, isAppError } from './errors.ts'
import { RateLimiter } from './http/rateLimit.ts'
import { cancelOrder, createOrder, getOrderView } from './orders/service.ts'
import { PaymentAuthError } from './payments/provider.ts'
import { confirmClientPayment, handleWebhook, resolveSandboxPayment, startPayment } from './payments/service.ts'
import { PUBLIC_ID_PATTERN } from './orders/repo.ts'
import { storeUpload } from './uploads/service.ts'

type Env = { Variables: { requestId: string } }

const JSON_LIMIT = 512 * 1024
const ORDER_TOKEN_HEADER = 'x-order-token'

/** Lifecycle events the browser may report. A closed list: nothing else is accepted or logged. */
const CLIENT_EVENTS = new Set(['design.confirmed', 'checkout.started'])

const eventSchema = z.object({
  name: z.string(),
  frames: z.number().int().min(0).max(100).optional(),
  totalMinor: z.number().int().min(0).max(1_000_000_000).optional(),
})

function clientIp(c: Context<Env>): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? 'local'
}

/**
 * Builds the HTTP application from an AppContext. Nothing here holds state of
 * its own: tests construct it around an in-memory database and call
 * `app.request(...)` directly, with no network.
 */
export function createApp(ctx: AppContext): Hono<Env> {
  const app = new Hono<Env>()
  const limiter = new RateLimiter(ctx.config.rateLimit.windowMs)
  const { rateLimit } = ctx.config

  // ------------------------------------------------------------ middleware
  app.use('*', async (c, next) => {
    c.set('requestId', ctx.randomId(6))
    await next()
    c.header('X-Request-Id', c.get('requestId'))
  })
  app.use('/api/*', secureHeaders())
  if (ctx.config.corsOrigins.length > 0) app.use('/api/*', cors({ origin: ctx.config.corsOrigins, allowHeaders: ['Content-Type', 'Idempotency-Key', 'X-Order-Token'] }))

  const limit = (bucket: string, max: number) => async (c: Context<Env>, next: () => Promise<void>) => {
    if (rateLimit.enabled && !limiter.allow(`${bucket}:${clientIp(c)}`, max)) throw errors.tooMany()
    await next()
  }
  const jsonLimit = bodyLimit({ maxSize: JSON_LIMIT, onError: () => { throw errors.tooLarge('That request is too large.') } })

  app.onError((error, c) => {
    const requestId = c.get('requestId')
    if (isAppError(error)) {
      return c.json({ error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) } }, error.status as 400)
    }
    if (error instanceof PaymentAuthError) {
      ctx.log.warn('payment.auth_failed', { requestId })
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'We couldn’t verify that request.' } }, 401)
    }
    // Anything else is a bug or an outage. The customer gets a calm generic
    // message and a reference; the real cause goes to the log only.
    ctx.log.error('request.failed', { requestId, path: c.req.path, message: String((error as Error)?.message ?? error) })
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again in a moment.', requestId } }, 500)
  })

  // ------------------------------------------------------------ read-only
  app.get('/api/health', (c) => c.json({ ok: true, env: ctx.config.env, paymentProvider: ctx.payments.name }))

  app.get('/api/config', (c) =>
    c.json({
      paymentProvider: ctx.payments.name,
      sandbox: ctx.payments.name === 'sandbox',
      whatsappNumber: ctx.config.whatsappNumber,
    }),
  )

  app.get('/api/catalog', async (c) => {
    c.header('Cache-Control', 'no-cache')
    return c.json(publicCatalog(await loadCatalog(ctx.db)))
  })

  // ------------------------------------------------------------ uploads
  app.post(
    '/api/uploads',
    limit('upload', rateLimit.uploadMax),
    bodyLimit({ maxSize: ctx.config.maxUploadBytes, onError: () => { throw errors.tooLarge('That image is too large.') } }),
    async (c) => {
      const bytes = Buffer.from(await c.req.arrayBuffer())
      const upload = await storeUpload(ctx, bytes)
      return c.json({ uploadId: upload.uploadId, width: upload.width, height: upload.height, bytes: upload.bytes, mime: upload.mime })
    },
  )

  // ------------------------------------------------------------ orders
  app.post('/api/orders', limit('order', rateLimit.max), jsonLimit, async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw errors.badRequest('That request wasn’t readable.')
    }
    const created = await createOrder(ctx, body, c.req.header('idempotency-key'))
    return c.json({ order: created.order, replayed: created.replayed, digest: created.digest }, created.replayed ? 200 : 201)
  })

  const orderId = (c: Context<Env>) => {
    const id = c.req.param('id') ?? ''
    if (!PUBLIC_ID_PATTERN.test(id)) throw errors.notFound('That order')
    return id
  }
  const token = (c: Context<Env>) => c.req.header(ORDER_TOKEN_HEADER)

  app.get('/api/orders/:id', limit('read', rateLimit.max * 4), async (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({ order: await getOrderView(ctx, orderId(c), token(c)) })
  })

  app.post('/api/orders/:id/cancel', limit('order', rateLimit.max), async (c) => c.json({ order: await cancelOrder(ctx, orderId(c), token(c)) }))

  // ------------------------------------------------------------ payments
  app.post('/api/orders/:id/payments', limit('pay', rateLimit.max), async (c) => {
    const started = await startPayment(ctx, orderId(c), token(c))
    return c.json({ payment: started })
  })

  app.post('/api/orders/:id/payments/:paymentId/confirm', limit('pay', rateLimit.max), jsonLimit, async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw errors.badRequest('That request wasn’t readable.')
    }
    const order = await confirmClientPayment(ctx, orderId(c), token(c), c.req.param('paymentId') ?? '', body)
    return c.json({ order })
  })

  // Provider webhooks: authenticated by the provider's signature, not by a token.
  app.post('/api/webhooks/:provider', jsonLimit, async (c) => {
    if (c.req.param('provider') !== ctx.payments.name) throw errors.notFound()
    const raw = await c.req.text()
    const results = await handleWebhook(ctx, raw, { get: (name) => c.req.header(name) })
    return c.json({ received: true, results: results.map((r) => r.outcome) })
  })

  // Sandbox only: stands in for the gateway's hosted payment page.
  app.post('/api/sandbox/payments/:paymentId/:outcome', limit('pay', rateLimit.max), async (c) => {
    if (ctx.payments.name !== 'sandbox' || ctx.config.env === 'production') throw errors.notFound()
    const outcome = c.req.param('outcome')
    if (outcome !== 'succeed' && outcome !== 'fail' && outcome !== 'cancel') throw errors.notFound()
    const result = await resolveSandboxPayment(ctx, c.req.param('paymentId') ?? '', outcome)
    return c.json({ outcome: result.outcome })
  })

  // ------------------------------------------------------------ lifecycle events
  app.post('/api/events', limit('event', rateLimit.max * 2), jsonLimit, async (c) => {
    const parsed = eventSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success || !CLIENT_EVENTS.has(parsed.data.name)) throw errors.badRequest('Unknown event.')
    ctx.log.event(parsed.data.name, { source: 'browser', frames: parsed.data.frames, totalMinor: parsed.data.totalMinor })
    return c.body(null, 204)
  })

  app.all('/api/*', () => {
    throw new AppError('NOT_FOUND', 404, 'That isn’t something we can find.')
  })

  // ------------------------------------------------------------ the website
  if (ctx.config.staticDir && existsSync(join(ctx.config.staticDir, 'index.html'))) {
    const root = ctx.config.staticDir
    app.use('/*', serveStatic({ root }))
    // Any other page (/order/FRM-…) is the single-page app; it reads its own URL.
    app.get('*', serveStatic({ path: join(root, 'index.html') }))
  }

  return app
}
