import type {
  AdminCatalog,
  AdminDashboard,
  AdminOrderDetail,
  AdminOrderSummary,
  AdminUser,
  BulkPriceUpdateInput,
  CatalogAuditEntry,
  ProductCreateInput,
  ProductUpdateInput,
  SizeCreateInput,
  SizeUpdateInput,
} from '../../../shared/admin'

/**
 * The admin frontend's own API client — deliberately separate from
 * `src/order/api.ts`. Nothing in `src/admin/` is imported by the
 * customer-facing app, and nothing here imports from it either, so the two
 * stay in their own bundles (see `src/main.tsx`).
 *
 * Authentication is an httpOnly session cookie (`credentials: 'include'`);
 * every mutating call also echoes the non-httpOnly CSRF cookie back as a
 * header, which `server/auth/session.ts` checks.
 */

export class AdminApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: unknown
  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AdminApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError
}

export interface StaleVersionDetails {
  productId: string
  sizeId: string | null
  expectedVersion: number
  currentVersion: number
}

export interface FieldIssue {
  field: string
  message: string
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)admin_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}
  let body: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  if (method !== 'GET' && method !== 'HEAD') headers['x-admin-csrf'] = csrfToken()

  let response: Response
  try {
    response = await fetch(`/api/admin${path}`, { method, headers, body, credentials: 'include' })
  } catch {
    throw new AdminApiError('NETWORK', 0, 'We couldn’t reach the server. Please check your connection and try again.')
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
    if (error?.code) throw new AdminApiError(error.code, response.status, error.message ?? 'Something went wrong.', error.details)
    throw new AdminApiError('UNEXPECTED', response.status, 'Something went wrong. Please try again.')
  }
  return json as T
}

export const adminApi = {
  login: (email: string, password: string) => request<{ user: AdminUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AdminUser }>('/auth/me'),

  dashboard: () => request<AdminDashboard>('/dashboard'),
  catalog: () => request<AdminCatalog>('/catalog'),

  createProduct: (input: ProductCreateInput) => request<AdminCatalog>('/products', { method: 'POST', body: input }),
  updateProduct: (id: string, input: ProductUpdateInput) => request<AdminCatalog>(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
  createSize: (productId: string, input: SizeCreateInput) => request<AdminCatalog>(`/products/${encodeURIComponent(productId)}/sizes`, { method: 'POST', body: input }),
  updateSize: (productId: string, sizeId: string, input: SizeUpdateInput) =>
    request<AdminCatalog>(`/products/${encodeURIComponent(productId)}/sizes/${encodeURIComponent(sizeId)}`, { method: 'PATCH', body: input }),
  bulkUpdatePrices: (input: BulkPriceUpdateInput) => request<AdminCatalog>('/prices/bulk', { method: 'PATCH', body: input }),

  audit: (filter: { productId?: string; sizeId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (filter.productId) params.set('productId', filter.productId)
    if (filter.sizeId) params.set('sizeId', filter.sizeId)
    if (filter.limit) params.set('limit', String(filter.limit))
    const qs = params.toString()
    return request<{ entries: CatalogAuditEntry[] }>(`/audit${qs ? `?${qs}` : ''}`)
  },
  revert: (entryId: number, expectedVersion: number) => request<AdminCatalog>(`/audit/${entryId}/revert`, { method: 'POST', body: { expectedVersion } }),

  orders: (before?: string) => request<{ orders: AdminOrderSummary[] }>(`/orders${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  order: (publicId: string) => request<{ order: AdminOrderDetail }>(`/orders/${encodeURIComponent(publicId)}`),
}
