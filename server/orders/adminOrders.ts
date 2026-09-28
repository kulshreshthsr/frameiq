import type { AdminOrderDetail, AdminOrderSummary } from '../../shared/admin.ts'
import type { DeliveryAddress } from '../../shared/customer.ts'
import { query, queryOne, type Executor } from '../db/client.ts'
import { loadItems } from './repo.ts'

/**
 * The owner's view of orders: unlike `OrderView` (what a customer may see),
 * this includes the full delivery address, because the owner has to actually
 * post the package — but it's still read-only. Fulfilment status, refunds
 * and the like are Phase 3; today the owner reads this and the production
 * package (`npm run order:package`) to run the workshop.
 */

type Row = Record<string, unknown>

function rowToSummary(r: Row): AdminOrderSummary {
  return {
    publicOrderId: String(r.public_id),
    customerName: String(r.customer_name),
    totalMinor: Number(r.total_minor),
    currency: String(r.currency),
    paymentStatus: String(r.payment_status),
    orderStatus: String(r.order_status),
    createdAt: String(r.created_at),
  }
}

export interface ListOrdersOptions {
  limit?: number
  before?: string // an order's public id: page to orders created earlier than it
}

export async function listOrdersForAdmin(ex: Executor, options: ListOrdersOptions = {}): Promise<AdminOrderSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  if (options.before) {
    const anchor = await queryOne(ex, 'SELECT created_at, id FROM orders WHERE public_id = ?', [options.before])
    if (anchor) {
      const rows = await query(ex, 'SELECT * FROM orders WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?', [String(anchor.created_at), Number(anchor.id), limit])
      return rows.map((r) => rowToSummary(r as unknown as Row))
    }
  }
  const rows = await query(ex, 'SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT ?', [limit])
  return rows.map((r) => rowToSummary(r as unknown as Row))
}

export async function countOrders(ex: Executor): Promise<{ total: number; paid: number }> {
  const total = await queryOne(ex, 'SELECT COUNT(*) AS n FROM orders')
  const paid = await queryOne(ex, `SELECT COUNT(*) AS n FROM orders WHERE payment_status = 'paid'`)
  return { total: Number(total?.n ?? 0), paid: Number(paid?.n ?? 0) }
}

export async function getOrderForAdmin(ex: Executor, publicId: string): Promise<AdminOrderDetail | null> {
  const row = await queryOne(ex, 'SELECT * FROM orders WHERE public_id = ?', [publicId])
  if (!row) return null
  const delivery = JSON.parse(String(row.delivery_json)) as DeliveryAddress
  const items = await loadItems(ex, Number(row.id))
  return {
    ...rowToSummary(row as unknown as Row),
    customerMobile: String(row.customer_mobile),
    delivery: { line1: delivery.line1, line2: delivery.line2, city: delivery.city, state: delivery.state, pin: delivery.pin },
    catalogVersion: String(row.catalog_version),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    items: items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      sizeId: i.sizeId,
      sizeLabel: i.sizeLabel,
      glassName: i.glassName,
      matName: i.matName,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
      lineTotalMinor: i.lineTotalMinor,
    })),
  }
}
