import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, isApiError } from './api'

const reply = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Runs a call to completion while fake time advances through retry delays. */
async function settle<T>(promise: Promise<T>): Promise<T | { failed: unknown }> {
  const guarded = promise.catch((failed) => ({ failed }))
  await vi.advanceTimersByTimeAsync(10_000)
  return guarded as Promise<T | { failed: unknown }>
}

describe('api client', () => {
  it('sends the order token and idempotency key as headers', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { order: { publicOrderId: 'FRM-2026-000001' } }))
    await settle(api.getOrder('FRM-2026-000001', 'tok'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/orders/FRM-2026-000001')
    expect(init.headers).toEqual({ 'X-Order-Token': 'tok' })

    fetchMock.mockResolvedValueOnce(reply(201, { order: {}, replayed: false }))
    await settle(api.createOrder({} as never, 'idem_1'))
    const [, create] = fetchMock.mock.calls[1]
    expect(create.method).toBe('POST')
    expect(create.headers['Idempotency-Key']).toBe('idem_1')
  })

  it('turns the server’s error envelope into a typed error carrying its message and details', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { error: { code: 'PRICE_CHANGED', message: 'The price has changed.', details: { totalMinor: 134700 } } }))
    const result = (await settle(api.createOrder({} as never, 'k'))) as { failed: unknown }
    expect(isApiError(result.failed)).toBe(true)
    expect(result.failed).toMatchObject({ code: 'PRICE_CHANGED', status: 409, message: 'The price has changed.', details: { totalMinor: 134700 } })
  })

  it('never shows a raw server error page — an unrecognised failure becomes a calm message', async () => {
    fetchMock.mockImplementation(async () => reply(502, '<html>Bad gateway</html>'))
    const result = (await settle(api.config())) as { failed: { code: string; message: string } }
    expect(result.failed.code).toBe('UNEXPECTED')
    expect(result.failed.message).not.toContain('html')
  })

  it('retries a dropped connection for calls that are safe to repeat, then succeeds', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(reply(200, { order: { publicOrderId: 'x' } }))
    const result = await settle(api.getOrder('FRM-2026-000001', 't'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ publicOrderId: 'x' })
  })

  it('gives up after its retries, reporting a connection problem', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = (await settle(api.getOrder('FRM-2026-000001', 't'))) as { failed: { code: string } }
    expect(result.failed.code).toBe('NETWORK')
    expect(fetchMock).toHaveBeenCalledTimes(3) // first try + 2 retries
  })

  it('does not retry a request the server understood and refused', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: { code: 'NOT_FOUND', message: 'nope' } }))
    await settle(api.getOrder('FRM-2026-000001', 't'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry the fire-and-forget event call, and never throws from it', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    expect(() => api.track('checkout.started', { frames: 2 })).not.toThrow()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uploads raw bytes with their content type', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { uploadId: 'up_1', width: 10, height: 10 }))
    await settle(api.uploadImage(new Blob(['x'], { type: 'image/png' })))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/uploads')
    expect(init.headers['Content-Type']).toBe('image/png')
  })
})
