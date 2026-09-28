import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApiError } from './adminApi'
import { useAdminAuth } from './adminStore'

const mocks = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('./adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adminApi')>()
  return { ...actual, adminApi: { me: mocks.me, login: mocks.login, logout: mocks.logout } }
})

const user = { id: 'u1', name: 'Owner', email: 'owner@shop.example', role: 'owner', active: true, createdAt: '', updatedAt: '', lastLoginAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  useAdminAuth.setState({ status: 'checking', user: null, error: null })
})

describe('checkSession', () => {
  it('becomes authed when the server recognises the session', async () => {
    mocks.me.mockResolvedValue({ user })
    await useAdminAuth.getState().checkSession()
    expect(useAdminAuth.getState()).toMatchObject({ status: 'authed', user })
  })

  it('becomes anon on a 401, without throwing', async () => {
    mocks.me.mockRejectedValue(new AdminApiError('UNAUTHORIZED', 401, 'no'))
    await useAdminAuth.getState().checkSession()
    expect(useAdminAuth.getState()).toMatchObject({ status: 'anon', user: null })
  })
})

describe('login', () => {
  it('signs in and clears any earlier error', async () => {
    useAdminAuth.setState({ error: 'stale error' })
    mocks.login.mockResolvedValue({ user })
    const ok = await useAdminAuth.getState().login('owner@shop.example', 'right-password')
    expect(ok).toBe(true)
    expect(useAdminAuth.getState()).toMatchObject({ status: 'authed', user, error: null })
  })

  it('a wrong password gives a plain, specific message', async () => {
    mocks.login.mockRejectedValue(new AdminApiError('UNAUTHORIZED', 401, 'nope'))
    const ok = await useAdminAuth.getState().login('owner@shop.example', 'wrong')
    expect(ok).toBe(false)
    expect(useAdminAuth.getState().error).toBe('Incorrect email or password.')
    expect(useAdminAuth.getState().status).toBe('checking') // unchanged — still not authed, but no crash either
  })

  it('a network problem gives a different, honest message', async () => {
    mocks.login.mockRejectedValue(new AdminApiError('NETWORK', 0, 'offline'))
    await useAdminAuth.getState().login('owner@shop.example', 'x')
    expect(useAdminAuth.getState().error).toContain('try again')
  })
})

describe('logout', () => {
  it('clears the session even if the request fails', async () => {
    useAdminAuth.setState({ status: 'authed', user })
    mocks.logout.mockRejectedValue(new Error('offline'))
    await useAdminAuth.getState().logout()
    expect(useAdminAuth.getState()).toMatchObject({ status: 'anon', user: null })
  })
})
