import { beforeEach, describe, expect, it } from 'vitest'
import { apiFor, createOwner, createTestServer, loginOwner, type TestServer } from '../test/harness.ts'
import { hashPassword, verifyPassword } from './password.ts'
import { pruneExpiredSessions } from './session.ts'

let server: TestServer

beforeEach(async () => {
  server = await createTestServer()
})

describe('password hashing', () => {
  it('a hash never contains the plain password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toContain('correct horse')
    expect(hash.startsWith('scrypt:')).toBe(true)
  })

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('my-real-password')
    expect(await verifyPassword('my-real-password', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('two hashes of the same password differ (random salt) but both verify', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same-password', a)).toBe(true)
    expect(await verifyPassword('same-password', b)).toBe(true)
  })

  it('never throws on a malformed stored hash', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false)
    await expect(verifyPassword('x', 'scrypt:bad:bad:bad:zz:zz')).resolves.toBe(false)
    await expect(verifyPassword('x', '')).resolves.toBe(false)
  })
})

describe('POST /api/admin/auth/login', () => {
  it('a valid owner login succeeds and sets a session', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { response } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { email: string; role: string } }
    expect(body.user.email).toBe('owner@shop.example')
    expect(body.user.role).toBe('owner')
    expect(JSON.stringify(body)).not.toContain('password')
    const cookies = response.headers.getSetCookie().join(' ')
    expect(cookies).toContain('admin_session=')
    expect(cookies).toContain('HttpOnly')
    expect(cookies).toContain('admin_csrf=')
  })

  it('the wrong password is refused', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { response } = await loginOwner(server, 'owner@shop.example', 'totally-wrong')
    expect(response.status).toBe(401)
  })

  it('an unknown email is refused the same way as a wrong password (no user enumeration)', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { response } = await loginOwner(server, 'nobody@shop.example', 'whatever')
    expect(response.status).toBe(401)
  })

  it('an inactive owner cannot log in', async () => {
    await createOwner(server, { email: 'gone@shop.example', password: 'a-strong-password-1' })
    await server.ctx.db.execute({ sql: 'UPDATE users SET active = 0 WHERE email = ?', args: ['gone@shop.example'] })
    const { response } = await loginOwner(server, 'gone@shop.example', 'a-strong-password-1')
    expect(response.status).toBe(401)
  })

  it('rejects a malformed request without leaking a stack trace', async () => {
    const response = await apiFor(server).post('/api/admin/auth/login', { email: 'not-an-email' })
    expect(response.status).toBe(400)
  })
})

describe('session-protected routes', () => {
  it('no session at all is unauthorized', async () => {
    const response = await apiFor(server).get('/api/admin/dashboard')
    expect(response.status).toBe(401)
  })

  it('a garbage cookie is unauthorized, not a crash', async () => {
    const response = await apiFor(server).get('/api/admin/dashboard', { Cookie: 'admin_session=not-a-real-token' })
    expect(response.status).toBe(401)
  })

  it('a valid session reaches the route', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { session } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')
    const response = await apiFor(server).get('/api/admin/dashboard', session.headers())
    expect(response.status).toBe(200)
  })

  it('logging out ends the session', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { session } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')
    const out = await apiFor(server).post('/api/admin/auth/logout', undefined, session.headers())
    expect(out.status).toBe(204)
    const after = await apiFor(server).get('/api/admin/dashboard', session.headers())
    expect(after.status).toBe(401)
  })

  it('a session past its expiry is treated as anonymous', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { session } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')
    server.clock.now = new Date(server.clock.now.getTime() + 13 * 60 * 60 * 1000) // past the 12h session
    const response = await apiFor(server).get('/api/admin/dashboard', session.headers())
    expect(response.status).toBe(401)
  })

  it('a non-owner account is authenticated but forbidden (403, not 401)', async () => {
    await createOwner(server, { email: 'staff@shop.example', password: 'a-strong-password-1', role: 'staff' })
    const { response: loginResponse, session } = await loginOwner(server, 'staff@shop.example', 'a-strong-password-1')
    expect(loginResponse.status).toBe(200) // the account IS real and the password IS right
    const response = await apiFor(server).get('/api/admin/dashboard', session.headers())
    expect(response.status).toBe(403)
  })

  it('a mutating request without the CSRF header is refused even with a valid session', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { session } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')
    const { 'x-admin-csrf': _drop, ...cookieOnly } = session.headers()
    const response = await apiFor(server).patch('/api/admin/prices/bulk', { updates: [] }, cookieOnly)
    expect(response.status).toBe(403)
  })

  it('a mismatched CSRF header is refused', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { session } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')
    const response = await apiFor(server).patch('/api/admin/prices/bulk', { updates: [] }, { ...session.headers(), 'x-admin-csrf': 'someone-elses-token' })
    expect(response.status).toBe(403)
  })

  it('GET requests need no CSRF header (only reads)', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { session } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')
    const { 'x-admin-csrf': _drop, ...cookieOnly } = session.headers()
    const response = await apiFor(server).get('/api/admin/catalog', cookieOnly)
    expect(response.status).toBe(200)
  })
})

describe('login rate limiting', () => {
  it('locks out repeated failed attempts from the same client', async () => {
    const limited = await createTestServer({ RATE_LIMIT: 'on' })
    await createOwner(limited, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    let sawTooMany = false
    for (let i = 0; i < 15; i++) {
      const response = await loginOwner(limited, 'owner@shop.example', 'wrong-password')
      if (response.response.status === 429) sawTooMany = true
    }
    expect(sawTooMany).toBe(true)
  })
})

describe('pruneExpiredSessions', () => {
  it('removes only the sessions that have actually expired', async () => {
    await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
    const { session: oldSession } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1')

    server.clock.now = new Date(server.clock.now.getTime() + 13 * 60 * 60 * 1000) // past the 12h session TTL
    const { session: freshSession } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1') // a brand-new, still-valid one

    const removed = await pruneExpiredSessions(server.ctx)
    expect(removed).toBe(1) // just the old one

    expect((await apiFor(server).get('/api/admin/dashboard', oldSession.headers())).status).toBe(401)
    expect((await apiFor(server).get('/api/admin/dashboard', freshSession.headers())).status).toBe(200)
  })
})
