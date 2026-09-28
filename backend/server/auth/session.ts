import { createHash, timingSafeEqual } from 'node:crypto'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { OWNER_ROLE, type AdminUser } from '../../../shared/admin.ts'
import type { AppContext } from '../context.ts'
import { queryOne, run } from '../db/client.ts'
import { findUserById, toAdminUser, type UserRow } from './users.ts'

/**
 * OWNER ADMIN SESSIONS.
 *
 * A session is a random, high-entropy token; only its SHA-256 hash is
 * stored, exactly like a customer order's access token (`orders/repo.ts`).
 * It is carried in an httpOnly cookie scoped to the admin API, so it is never
 * visible to page JavaScript and never sent to any other route.
 *
 * A second, deliberately NON-httpOnly cookie carries a CSRF token that every
 * mutating request must also echo back in a header (the "double submit"
 * pattern) — a cross-site request can ride the session cookie automatically,
 * but a page on another origin cannot read this cookie to copy its value.
 */

export const SESSION_COOKIE = 'admin_session'
export const CSRF_COOKIE = 'admin_csrf'
export const CSRF_HEADER = 'x-admin-csrf'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // a working day

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function cookieOptions(ctx: Pick<AppContext, 'config'>, extra: { httpOnly: boolean }) {
  return {
    // The session cookie only needs to reach the API, so it's scoped tightly.
    // The CSRF cookie is READ BY PAGE JAVASCRIPT running under /admin — a
    // cookie's Path controls which requests carry it, not who can read it
    // (that's the origin, same as any cookie), so Path=/ here is the normal,
    // correct shape for a double-submit token, not a widening of exposure.
    path: extra.httpOnly ? '/api/admin' : '/',
    httpOnly: extra.httpOnly,
    secure: ctx.config.env === 'production',
    sameSite: 'Lax' as const,
    maxAge: SESSION_TTL_MS / 1000,
  }
}

export interface Session {
  token: string
  csrfToken: string
  expiresAt: string
}

/** Creates a session for `user` and returns the values to put in cookies. */
export async function createSession(ctx: AppContext, userId: string): Promise<Session> {
  const token = ctx.randomId(32)
  const csrfToken = ctx.randomId(24)
  const now = ctx.now()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  await run(ctx.db, 'INSERT INTO admin_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)', [
    ctx.randomId(12),
    userId,
    sha256(token),
    now.toISOString(),
    expiresAt.toISOString(),
    now.toISOString(),
  ])
  return { token, csrfToken, expiresAt: expiresAt.toISOString() }
}

/** The user a presented session token belongs to, or null if it doesn't
 * identify a live session for an active owner. Touches `last_seen_at`. */
export async function userForSessionToken(ctx: AppContext, token: string): Promise<UserRow | null> {
  if (!token) return null
  const hash = sha256(token)
  const row = await queryOne(ctx.db, 'SELECT * FROM admin_sessions WHERE token_hash = ?', [hash])
  if (!row) return null
  const now = ctx.now()
  if (new Date(String(row.expires_at)).getTime() <= now.getTime()) {
    await run(ctx.db, 'DELETE FROM admin_sessions WHERE id = ?', [row.id])
    return null
  }
  const user = await findUserById(ctx.db, String(row.user_id))
  if (!user || !user.active) return null
  await run(ctx.db, 'UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?', [now.toISOString(), row.id])
  return user
}

export async function destroySessionByToken(ctx: AppContext, token: string): Promise<void> {
  if (!token) return
  await run(ctx.db, 'DELETE FROM admin_sessions WHERE token_hash = ?', [sha256(token)])
}

/** Ends every other session for this user (used nowhere yet, but is the
 * shape a future "sign out everywhere" action would call). */
export async function destroyAllSessions(ctx: AppContext, userId: string): Promise<void> {
  await run(ctx.db, 'DELETE FROM admin_sessions WHERE user_id = ?', [userId])
}

export async function pruneExpiredSessions(ctx: AppContext): Promise<number> {
  const now = ctx.now().toISOString()
  const result = await run(ctx.db, 'DELETE FROM admin_sessions WHERE expires_at <= ?', [now])
  return Number(result.rowsAffected)
}

// ---------------------------------------------------------------- cookies

export function setSessionCookies(c: Context, ctx: Pick<AppContext, 'config'>, session: Session): void {
  setCookie(c, SESSION_COOKIE, session.token, cookieOptions(ctx, { httpOnly: true }))
  setCookie(c, CSRF_COOKIE, session.csrfToken, cookieOptions(ctx, { httpOnly: false }))
}

export function clearSessionCookies(c: Context, ctx: Pick<AppContext, 'config'>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/api/admin' })
  deleteCookie(c, CSRF_COOKIE, { path: '/' })
  void ctx
}

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE)
}

/** True if the request's CSRF header matches its (non-httpOnly) CSRF cookie. */
export function csrfOk(c: Context): boolean {
  const cookie = getCookie(c, CSRF_COOKIE)
  const header = c.req.header(CSRF_HEADER)
  if (!cookie || !header) return false
  const a = Buffer.from(cookie)
  const b = Buffer.from(header)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function safeUser(row: UserRow): AdminUser {
  return toAdminUser(row)
}

export { OWNER_ROLE }

export async function anyOwnerExists(ctx: Pick<AppContext, 'db'>): Promise<boolean> {
  const row = await queryOne(ctx.db, 'SELECT 1 AS one FROM users WHERE role = ? LIMIT 1', [OWNER_ROLE])
  return Boolean(row)
}
