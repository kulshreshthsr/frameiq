import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, isAdminApiError } from './adminApi'

const reply = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(reply(200, {}))
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'admin_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})
afterEach(() => vi.unstubAllGlobals())

describe('adminApi', () => {
  it('sends cookies (session auth) and reads /api/admin/*', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { user: { id: 'u1', email: 'a@b.com' } }))
    await adminApi.me()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/auth/me')
    expect(init.credentials).toBe('include')
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('echoes the CSRF cookie as a header on every mutating request, but not on reads', async () => {
    document.cookie = 'admin_csrf=the-csrf-token'
    fetchMock.mockResolvedValueOnce(reply(200, { user: {} }))
    await adminApi.login('a@b.com', 'pw')
    const [, postInit] = fetchMock.mock.calls[0]
    expect(postInit.headers['x-admin-csrf']).toBe('the-csrf-token')
    expect(postInit.method).toBe('POST')
    expect(JSON.parse(postInit.body)).toEqual({ email: 'a@b.com', password: 'pw' })

    fetchMock.mockResolvedValueOnce(reply(200, {}))
    await adminApi.dashboard()
    const [, getInit] = fetchMock.mock.calls[1]
    expect(getInit.headers?.['x-admin-csrf']).toBeUndefined()
  })

  it('turns the server error envelope into a typed AdminApiError', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { error: { code: 'STALE_VERSION', message: 'This was changed by someone else.', details: { currentVersion: 3 } } }))
    const result = await adminApi.updateProduct('walnut', { expectedVersion: 1, name: 'x' }).catch((e: unknown) => e)
    expect(isAdminApiError(result)).toBe(true)
    expect(result).toMatchObject({ code: 'STALE_VERSION', status: 409, details: { currentVersion: 3 } })
  })

  it('never surfaces a raw error page', async () => {
    fetchMock.mockResolvedValueOnce(reply(502, '<html>Bad gateway</html>'))
    const result = await adminApi.catalog().catch((e: unknown) => e)
    expect(isAdminApiError(result)).toBe(true)
    expect((result as { message: string }).message).not.toContain('html')
  })

  it('reports a dropped connection distinctly', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const result = await adminApi.dashboard().catch((e: unknown) => e)
    expect(isAdminApiError(result)).toBe(true)
    expect((result as { code: string }).code).toBe('NETWORK')
  })

  it('builds the bulk pricing and audit query strings correctly', async () => {
    fetchMock.mockResolvedValue(reply(200, { entries: [] }))
    await adminApi.audit({ productId: 'walnut', sizeId: '12x18', limit: 5 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/audit?productId=walnut&sizeId=12x18&limit=5')

    fetchMock.mockResolvedValue(reply(200, { user: {} }))
    await adminApi.bulkUpdatePrices({ updates: [{ productId: 'walnut', sizeId: '12x18', newPriceMinor: 1000, expectedVersion: 1 }] })
    const [, init] = fetchMock.mock.calls[1]
    expect(init.method).toBe('PATCH')
  })
})
