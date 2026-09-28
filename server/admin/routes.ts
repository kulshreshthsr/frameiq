import type { Context, Hono } from 'hono'
import {
  bulkPriceUpdateSchema,
  loginRequestSchema,
  productCreateSchema,
  productUpdateSchema,
  revertRequestSchema,
  sizeCreateSchema,
  sizeUpdateSchema,
} from '../../shared/admin.ts'
import { verifyPassword } from '../auth/password.ts'
import { requireOwner, type AdminEnv } from '../auth/middleware.ts'
import { clearSessionCookies, createSession, destroySessionByToken, readSessionToken, safeUser, setSessionCookies } from '../auth/session.ts'
import { findUserByEmail, touchLastLogin } from '../auth/users.ts'
import { bulkUpdatePrices, createProduct, createSize, findAuditEntry, listAudit, loadAdminCatalog, revertPriceChange, StaleVersionError, updateProduct, updateSize } from '../catalog/adminCatalogRepo.ts'
import type { AppContext } from '../context.ts'
import { errors } from '../errors.ts'
import { getOrderForAdmin, listOrdersForAdmin } from '../orders/adminOrders.ts'
import { buildDashboard } from './dashboard.ts'

/** Turns a `StaleVersionError` into the 409 the frontend knows how to explain
 * ("this changed since you loaded it — reload and try again"). Anything else
 * is left for the app's normal error handler. */
function mapConcurrency(error: unknown): never {
  if (error instanceof StaleVersionError) {
    throw errors.conflict('STALE_VERSION', 'This was changed by someone else since you loaded it. Please reload and try again.', error.info)
  }
  throw error
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw errors.badRequest('That request wasn’t readable.')
  }
}

function validationError(issues: { path: PropertyKey[]; message: string }[]) {
  return errors.badRequest('Some of that needs another look.', { fields: issues.slice(0, 20).map((i) => ({ field: i.path.map(String).join('.'), message: i.message })) })
}

/** Hono can't statically know a param is present on a route registered
 * through a cast `basePath()` sub-router; it always is at runtime here, so
 * this just satisfies the type checker without an unchecked `!`. */
function param(c: Context, name: string): string {
  return c.req.param(name) ?? ''
}

/**
 * Mounts every `/api/admin/*` route. A completely separate area from the
 * customer-facing API: cookie-based OWNER sessions, CSRF-checked mutations,
 * and its own rate limiting on login. See `auth/session.ts` for the security
 * model and `catalog/adminCatalogRepo.ts` for how a price change is made
 * safe (validated, versioned, audited) without disturbing any past order.
 */
type Middleware = (c: Context, next: () => Promise<void>) => Promise<void | Response>

export function mountAdminRoutes(app: Hono<{ Variables: { requestId: string } }>, ctx: AppContext, jsonLimit: Middleware, limitLogin: Middleware) {
  const admin = app.basePath('/api/admin') as unknown as Hono<AdminEnv>
  const owner = requireOwner(ctx)

  // -------------------------------------------------------------- auth
  admin.post('/auth/login', limitLogin, jsonLimit, async (c) => {
    const parsed = loginRequestSchema.safeParse(await readJson(c))
    if (!parsed.success) throw validationError(parsed.error.issues)
    const { email, password } = parsed.data

    const user = await findUserByEmail(ctx.db, email)
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, 'scrypt:16384:8:1:00:00') // constant-time-ish even for an unknown email
    if (!user || !ok || !user.active) {
      ctx.log.event('admin.login_failed', { userId: user?.id, reason: !user ? 'no_such_user' : !ok ? 'bad_password' : 'inactive' })
      throw errors.unauthorized()
    }

    const session = await createSession(ctx, user.id)
    await touchLastLogin(ctx.db, user.id, ctx.now())
    setSessionCookies(c, ctx, session)
    ctx.log.event('admin.login_succeeded', { userId: user.id })
    return c.json({ user: safeUser(user) })
  })

  admin.post('/auth/logout', async (c) => {
    const token = readSessionToken(c)
    if (token) await destroySessionByToken(ctx, token)
    clearSessionCookies(c, ctx)
    return c.body(null, 204)
  })

  admin.get('/auth/me', owner, (c) => c.json({ user: c.get('adminUser') }))

  // -------------------------------------------------------------- dashboard
  admin.get('/dashboard', owner, async (c) => c.json(await buildDashboard(ctx.db)))

  // -------------------------------------------------------------- catalog
  admin.get('/catalog', owner, async (c) => c.json(await loadAdminCatalog(ctx.db)))

  admin.post('/products', owner, jsonLimit, async (c) => {
    const parsed = productCreateSchema.safeParse(await readJson(c))
    if (!parsed.success) throw validationError(parsed.error.issues)
    const catalog = await createProduct(ctx.db, parsed.data, c.get('adminUser'), ctx.now())
    ctx.log.event('admin.product_created', { productId: parsed.data.id, userId: c.get('adminUser').id })
    return c.json(catalog, 201)
  })

  admin.patch('/products/:id', owner, jsonLimit, async (c) => {
    const parsed = productUpdateSchema.safeParse(await readJson(c))
    if (!parsed.success) throw validationError(parsed.error.issues)
    try {
      const catalog = await updateProduct(ctx.db, param(c, 'id'), parsed.data, c.get('adminUser'), ctx.now())
      return c.json(catalog)
    } catch (error) {
      mapConcurrency(error)
    }
  })

  admin.post('/products/:id/sizes', owner, jsonLimit, async (c) => {
    const parsed = sizeCreateSchema.safeParse(await readJson(c))
    if (!parsed.success) throw validationError(parsed.error.issues)
    const catalog = await createSize(ctx.db, param(c, 'id'), parsed.data, c.get('adminUser'), ctx.now())
    ctx.log.event('admin.size_created', { productId: param(c, 'id'), sizeId: parsed.data.id, userId: c.get('adminUser').id })
    return c.json(catalog, 201)
  })

  admin.patch('/products/:id/sizes/:sizeId', owner, jsonLimit, async (c) => {
    const parsed = sizeUpdateSchema.safeParse(await readJson(c))
    if (!parsed.success) throw validationError(parsed.error.issues)
    try {
      const catalog = await updateSize(ctx.db, param(c, 'id'), param(c, 'sizeId'), parsed.data, c.get('adminUser'), ctx.now())
      return c.json(catalog)
    } catch (error) {
      mapConcurrency(error)
    }
  })

  admin.patch('/prices/bulk', owner, jsonLimit, async (c) => {
    const parsed = bulkPriceUpdateSchema.safeParse(await readJson(c))
    if (!parsed.success) throw validationError(parsed.error.issues)
    try {
      const catalog = await bulkUpdatePrices(ctx.db, parsed.data.updates, c.get('adminUser'), ctx.now(), parsed.data.note)
      ctx.log.event('admin.prices_bulk_updated', { count: parsed.data.updates.length, userId: c.get('adminUser').id })
      return c.json(catalog)
    } catch (error) {
      mapConcurrency(error)
    }
  })

  // -------------------------------------------------------------- audit / price history
  admin.get('/audit', owner, async (c) => {
    const productId = c.req.query('productId') || undefined
    const sizeId = c.req.query('sizeId') || undefined
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    return c.json({ entries: await listAudit(ctx.db, { productId, sizeId, limit }) })
  })

  admin.post('/audit/:entryId/revert', owner, jsonLimit, async (c) => {
    const entryId = Number(c.req.param('entryId'))
    if (!Number.isInteger(entryId)) throw errors.notFound('That price change')
    const parsed = revertRequestSchema.safeParse(await readJson(c))
    if (!parsed.success) throw validationError(parsed.error.issues)
    if (!(await findAuditEntry(ctx.db, entryId))) throw errors.notFound('That price change')
    try {
      const catalog = await revertPriceChange(ctx.db, entryId, parsed.data.expectedVersion, c.get('adminUser'), ctx.now())
      ctx.log.event('admin.price_reverted', { entryId, userId: c.get('adminUser').id })
      return c.json(catalog)
    } catch (error) {
      mapConcurrency(error)
    }
  })

  // -------------------------------------------------------------- orders (read-only)
  admin.get('/orders', owner, async (c) => {
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    const before = c.req.query('before') || undefined
    return c.json({ orders: await listOrdersForAdmin(ctx.db, { limit, before }) })
  })

  admin.get('/orders/:id', owner, async (c) => {
    const order = await getOrderForAdmin(ctx.db, param(c, 'id'))
    if (!order) throw errors.notFound('That order')
    return c.json({ order })
  })
}
