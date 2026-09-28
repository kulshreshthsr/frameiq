import type { Context, Next } from 'hono'
import type { AdminUser } from '../../../shared/admin.ts'
import { OWNER_ROLE } from '../../../shared/admin.ts'
import type { AppContext } from '../context.ts'
import { errors } from '../errors.ts'
import { csrfOk, readSessionToken, safeUser, userForSessionToken } from './session.ts'

export type AdminEnv = { Variables: { requestId: string; adminUser: AdminUser } }

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Every `/api/admin/*` mutation must be: a real session (401 if not), for an
 * OWNER (403 if not — a role that merely exists but isn't OWNER), whose
 * request carries a matching CSRF token (403 — see `session.ts`). Reads only
 * need the session; a GET can't be forged cross-site the way a POST can, and
 * requiring CSRF on it would just break opening a link.
 */
export function requireOwner(ctx: AppContext) {
  return async (c: Context<AdminEnv>, next: Next) => {
    const token = readSessionToken(c)
    if (!token) throw errors.unauthorized()
    const user = await userForSessionToken(ctx, token)
    if (!user) throw errors.unauthorized()
    if (!SAFE_METHODS.has(c.req.method) && !csrfOk(c)) throw errors.forbidden('That request couldn’t be verified. Please refresh the page and try again.')
    if (user.role !== OWNER_ROLE) throw errors.forbidden()
    c.set('adminUser', safeUser(user))
    await next()
  }
}
