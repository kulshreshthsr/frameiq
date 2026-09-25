import type { Catalog } from '../../shared/catalog'
import type { CreateOrderRequest, OrderView } from '../../shared/orderSchema'

/**
 * The browser's client for the ordering API. Every failure is an ApiError
 * carrying a stable `code` the UI reacts to and a customer-safe message; raw
 * network errors and server internals never surface.
 *
 * Calls that are safe to repeat (reads, content-addressed uploads, order
 * creation under an idempotency key, opening a payment) are retried a couple
 * of times on a network hiccup before giving up — which is what lets a shaky
 * mobile connection recover without the customer doing anything.
 */

export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNEXPECTED'
  | 'PRICE_CHANGED'
  | 'ITEM_UNAVAILABLE'
  | 'IMAGE_PROBLEMS'
  | 'MISSING_UPLOAD'
  | 'INVALID_ORDER_REQUEST'
  | 'INVALID_ORDER'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'NOT_FOUND'
  | 'ORDER_CLOSED'
  | 'ALREADY_PAID'
  | 'PAYMENT_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED_IMAGE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL'
  | string

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: unknown
  /** True when trying again might work (connection trouble, server hiccup). */
  readonly retryable: boolean

  constructor(code: ApiErrorCode, status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
    this.retryable = code === 'NETWORK' || code === 'TIMEOUT' || code === 'RATE_LIMITED' || status >= 500
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

interface RequestOptions {
  method?: string
  body?: BodyInit | null
  headers?: Record<string, string>
  timeoutMs?: number
  /** Extra attempts after the first, for calls that are safe to repeat. */
  retries?: number
  signal?: AbortSignal
}

const RETRY_DELAYS_MS = [400, 1200]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function apiBase(): string {
  return ''
}

async function attempt<T>(path: string, options: RequestOptions): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? 20_000)
  options.signal?.addEventListener('abort', () => controller.abort('cancelled'), { once: true })

  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (controller.signal.aborted) throw new ApiError('TIMEOUT', 0, 'That took too long. Please check your connection and try again.')
    throw new ApiError('NETWORK', 0, 'We couldn’t reach our servers. Please check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text().catch(() => '')
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!response.ok) {
    const error = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    if (error?.code) throw new ApiError(error.code, response.status, error.message ?? 'Something went wrong. Please try again.', error.details)
    throw new ApiError('UNEXPECTED', response.status, 'Something went wrong on our side. Please try again in a moment.')
  }
  return json as T
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const retries = options.retries ?? 0
  for (let n = 0; ; n++) {
    try {
      return await attempt<T>(path, options)
    } catch (error) {
      const canRetry = n < retries && isApiError(error) && error.retryable && !options.signal?.aborted
      if (!canRetry) throw error
      await sleep(RETRY_DELAYS_MS[Math.min(n, RETRY_DELAYS_MS.length - 1)])
    }
  }
}

const json = (body: unknown): Pick<RequestOptions, 'body' | 'headers'> => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})

// ---------------------------------------------------------------- endpoints

export interface ServerConfig {
  paymentProvider: 'sandbox' | 'razorpay'
  sandbox: boolean
  whatsappNumber: string | null
}

export interface UploadResult {
  uploadId: string
  width: number
  height: number
  bytes: number
  mime: string
}

export interface CreatedOrderResponse {
  order: OrderView
  replayed: boolean
  digest: string
}

export interface StartedPayment {
  paymentId: string
  provider: string
  amountMinor: number
  currency: string
  clientPayload: Record<string, unknown>
  alreadyPaid: boolean
  order: OrderView
}

const orderHeaders = (token: string) => ({ 'X-Order-Token': token })

export const api = {
  config: () => request<ServerConfig>('/api/config', { retries: 1, timeoutMs: 8000 }),

  catalog: () => request<Catalog>('/api/catalog', { retries: 1, timeoutMs: 8000 }),

  /** Content-addressed on the server, so repeating an upload is harmless. */
  uploadImage: (blob: Blob, signal?: AbortSignal) =>
    request<UploadResult>('/api/uploads', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' }, timeoutMs: 120_000, retries: 2, signal }),

  createOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    request<CreatedOrderResponse>('/api/orders', { method: 'POST', ...json(body), headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, retries: 2, timeoutMs: 30_000 }),

  getOrder: async (publicId: string, token: string) => (await request<{ order: OrderView }>(`/api/orders/${publicId}`, { headers: orderHeaders(token), retries: 2, timeoutMs: 10_000 })).order,

  cancelOrder: async (publicId: string, token: string) => (await request<{ order: OrderView }>(`/api/orders/${publicId}/cancel`, { method: 'POST', headers: orderHeaders(token), retries: 1 })).order,

  startPayment: async (publicId: string, token: string) => (await request<{ payment: StartedPayment }>(`/api/orders/${publicId}/payments`, { method: 'POST', headers: orderHeaders(token), retries: 2, timeoutMs: 30_000 })).payment,

  /** Razorpay: report the browser's signed result; the server verifies it. */
  confirmPayment: async (publicId: string, token: string, paymentId: string, payload: unknown) =>
    (await request<{ order: OrderView }>(`/api/orders/${publicId}/payments/${paymentId}/confirm`, { method: 'POST', ...json(payload), headers: { 'Content-Type': 'application/json', ...orderHeaders(token) }, retries: 2 })).order,

  /** Sandbox only. */
  sandboxResolve: (paymentId: string, outcome: 'succeed' | 'fail' | 'cancel') => request<{ outcome: string }>(`/api/sandbox/payments/${paymentId}/${outcome}`, { method: 'POST', retries: 2 }),

  /** Fire-and-forget lifecycle event; never blocks or fails the customer. */
  track: (name: 'design.confirmed' | 'checkout.started', fields: { frames?: number; totalMinor?: number } = {}) => {
    void request('/api/events', { method: 'POST', ...json({ name, ...fields }), timeoutMs: 4000 }).catch(() => undefined)
  },
}
