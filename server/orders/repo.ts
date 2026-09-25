import { createHash, timingSafeEqual } from 'node:crypto'
import type { DeliveryAddress } from '../../shared/customer.ts'
import type { OrderItemView, OrderStatus, OrderView, PaymentAttemptStatus, PaymentStatus } from '../../shared/orderSchema.ts'
import { queryOne, query, type Executor } from '../db/client.ts'

/** The order table's row, in application types. */
export interface OrderRow {
  id: number
  publicId: string
  accessTokenHash: string
  idempotencyKey: string
  requestHash: string
  customerName: string
  customerMobile: string
  delivery: DeliveryAddress
  currency: string
  subtotalMinor: number
  deliveryFeeMinor: number
  totalMinor: number
  paymentStatus: PaymentStatus
  orderStatus: OrderStatus
  catalogVersion: string
  snapshotJson: string
  snapshotDigest: string
  createdAt: string
  updatedAt: string
  paidAt: string | null
  cancelledAt: string | null
  packagePath: string | null
  packageGeneratedAt: string | null
}

type Row = Record<string, unknown>

export function rowToOrder(row: Row): OrderRow {
  return {
    id: Number(row.id),
    publicId: String(row.public_id),
    accessTokenHash: String(row.access_token_hash),
    idempotencyKey: String(row.idempotency_key),
    requestHash: String(row.request_hash),
    customerName: String(row.customer_name),
    customerMobile: String(row.customer_mobile),
    delivery: JSON.parse(String(row.delivery_json)) as DeliveryAddress,
    currency: String(row.currency),
    subtotalMinor: Number(row.subtotal_minor),
    deliveryFeeMinor: Number(row.delivery_fee_minor),
    totalMinor: Number(row.total_minor),
    paymentStatus: String(row.payment_status) as PaymentStatus,
    orderStatus: String(row.order_status) as OrderStatus,
    catalogVersion: String(row.catalog_version),
    snapshotJson: String(row.snapshot_json),
    snapshotDigest: String(row.snapshot_digest),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    packagePath: row.package_path ? String(row.package_path) : null,
    packageGeneratedAt: row.package_generated_at ? String(row.package_generated_at) : null,
  }
}

export async function findOrderByPublicId(ex: Executor, publicId: string): Promise<OrderRow | null> {
  const row = await queryOne(ex, 'SELECT * FROM orders WHERE public_id = ?', [publicId])
  return row ? rowToOrder(row as unknown as Row) : null
}

export async function findOrderById(ex: Executor, id: number): Promise<OrderRow | null> {
  const row = await queryOne(ex, 'SELECT * FROM orders WHERE id = ?', [id])
  return row ? rowToOrder(row as unknown as Row) : null
}

export async function findOrderByIdempotencyKey(ex: Executor, key: string): Promise<OrderRow | null> {
  const row = await queryOne(ex, 'SELECT * FROM orders WHERE idempotency_key = ?', [key])
  return row ? rowToOrder(row as unknown as Row) : null
}

export async function loadItems(ex: Executor, orderId: number): Promise<OrderItemView[]> {
  const rows = await query(ex, 'SELECT * FROM order_items WHERE order_id = ? ORDER BY position', [orderId])
  return rows.map((r) => ({
    productId: String(r.product_id),
    productName: String(r.product_name),
    sizeId: String(r.size_id),
    sizeLabel: String(r.size_label),
    glassName: String(r.glass_name),
    matName: String(r.mat_name),
    quantity: Number(r.quantity),
    unitPriceMinor: Number(r.unit_price_minor),
    lineTotalMinor: Number(r.line_total_minor),
  }))
}

export async function loadLastPayment(ex: Executor, orderId: number): Promise<OrderView['lastPayment']> {
  const row = await queryOne(ex, 'SELECT status, failure_reason FROM payments WHERE order_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', [orderId])
  return row ? { status: String(row.status) as PaymentAttemptStatus, failureReason: row.failure_reason ? String(row.failure_reason) : null } : null
}

/** What a customer is allowed to see about their order. No token hash, no
 * internal ids, no snapshot, no full address lines. */
export async function toOrderView(ex: Executor, order: OrderRow): Promise<OrderView> {
  return {
    publicOrderId: order.publicId,
    currency: order.currency,
    items: await loadItems(ex, order.id),
    subtotalMinor: order.subtotalMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    customerName: order.customerName,
    deliveryCity: order.delivery.city,
    deliveryState: order.delivery.state,
    deliveryPin: order.delivery.pin,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    lastPayment: await loadLastPayment(ex, order.id),
  }
}

// ---------------------------------------------------------------- access tokens

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/** Constant-time comparison of a presented token against its stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token))
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** `FRM-2026-000123` — human-friendly, sequential per year. */
export function formatPublicId(year: number, sequence: number): string {
  return `FRM-${year}-${String(sequence).padStart(6, '0')}`
}

export const PUBLIC_ID_PATTERN = /^FRM-\d{4}-\d{6,}$/
