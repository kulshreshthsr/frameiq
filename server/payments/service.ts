import { createHash } from 'node:crypto'
import { canonicalJson } from '../../shared/canonical.ts'
import type { OrderView, PaymentAttemptStatus } from '../../shared/orderSchema.ts'
import type { AppContext } from '../context.ts'
import { isUniqueViolation, queryOne, query, run, withTx, type Executor } from '../db/client.ts'
import { errors } from '../errors.ts'
import { enqueueNotification } from '../notifications/notifier.ts'
import { authorizeOrder } from '../orders/service.ts'
import { findOrderById, findOrderByPublicId, toOrderView, type OrderRow } from '../orders/repo.ts'
import { generateProductionPackage } from '../production/package.ts'
import type { PaymentEvent } from './provider.ts'

/**
 * PAYMENTS: THE ONLY PLACE AN ORDER BECOMES PAID.
 *
 * Rules this file enforces:
 *  - Only a VERIFIED provider event can change payment state. The browser
 *    coming back from a payment page proves nothing.
 *  - Every event is recorded under its unique id; receiving it again (a
 *    webhook replay, a double callback) changes nothing.
 *  - A payment is matched to its order by the provider's own order id, and
 *    the amount and currency must equal what we asked for.
 *  - `paid` is sticky: a later "failed" or "cancelled" event about another
 *    attempt can never undo it.
 *  - Money that arrives when it shouldn't (a second payment for an already
 *    paid order, a payment on a cancelled order) is FLAGGED loudly for a
 *    human to refund — never silently absorbed.
 */

export interface PaymentAttempt {
  id: string
  orderId: number
  provider: string
  providerOrderId: string
  providerPaymentId: string | null
  status: PaymentAttemptStatus
  amountMinor: number
  currency: string
  clientPayload: Record<string, unknown>
  failureReason: string | null
  flag: string | null
}

function rowToAttempt(row: Record<string, unknown>): PaymentAttempt {
  return {
    id: String(row.id),
    orderId: Number(row.order_id),
    provider: String(row.provider),
    providerOrderId: String(row.provider_order_id),
    providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : null,
    status: String(row.status) as PaymentAttemptStatus,
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency),
    clientPayload: JSON.parse(String(row.client_payload_json)) as Record<string, unknown>,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    flag: row.flag ? String(row.flag) : null,
  }
}

async function attemptById(ex: Executor, id: string): Promise<PaymentAttempt | null> {
  const row = await queryOne(ex, 'SELECT * FROM payments WHERE id = ?', [id])
  return row ? rowToAttempt(row as unknown as Record<string, unknown>) : null
}

// One payment start per order at a time (this server runs as a single process).
const orderLocks = new Map<string, Promise<void>>()
async function withOrderLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = orderLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => gate)
  orderLocks.set(key, tail)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (orderLocks.get(key) === tail) orderLocks.delete(key)
  }
}

// ---------------------------------------------------------------- start

export interface StartedPayment {
  paymentId: string
  provider: string
  amountMinor: number
  currency: string
  clientPayload: Record<string, unknown>
  /** True if the order is already paid (nothing to start). */
  alreadyPaid: boolean
  order: OrderView
}

/**
 * Opens (or re-opens) a payment attempt for an order. Repeating the call while
 * an attempt is still open returns THE SAME attempt — a double-click never
 * creates two charges.
 */
export async function startPayment(ctx: AppContext, publicId: string, token: string | undefined): Promise<StartedPayment> {
  const order = await authorizeOrder(ctx, publicId, token)
  return withOrderLock(order.publicId, async () => {
    const fresh = (await findOrderById(ctx.db, order.id))!
    if (fresh.paymentStatus === 'paid') {
      const view = await toOrderView(ctx.db, fresh)
      return { paymentId: '', provider: ctx.payments.name, amountMinor: fresh.totalMinor, currency: fresh.currency, clientPayload: {}, alreadyPaid: true, order: view }
    }
    if (fresh.orderStatus === 'cancelled' || fresh.paymentStatus === 'refunded') {
      throw errors.conflict('ORDER_CLOSED', 'This order was cancelled, so it can’t be paid. Please start a new order.')
    }

    const open = await queryOne(ctx.db, `SELECT * FROM payments WHERE order_id = ? AND status = 'created' AND provider = ? ORDER BY rowid DESC LIMIT 1`, [fresh.id, ctx.payments.name])
    if (open) {
      const attempt = rowToAttempt(open as unknown as Record<string, unknown>)
      return { paymentId: attempt.id, provider: attempt.provider, amountMinor: attempt.amountMinor, currency: attempt.currency, clientPayload: attempt.clientPayload, alreadyPaid: false, order: await toOrderView(ctx.db, fresh) }
    }

    const created = await ctx.payments.createPayment({
      publicOrderId: fresh.publicId,
      amountMinor: fresh.totalMinor,
      currency: fresh.currency,
      customerName: fresh.customerName,
      customerMobile: fresh.customerMobile,
    })
    const paymentId = `pay_${ctx.randomId(12)}`
    const now = ctx.now().toISOString()
    await withTx(ctx.db, async (tx) => {
      await run(
        tx,
        `INSERT INTO payments (id, order_id, provider, provider_order_id, status, amount_minor, currency, client_payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)`,
        [paymentId, fresh.id, ctx.payments.name, created.providerOrderId, fresh.totalMinor, fresh.currency, JSON.stringify(created.clientPayload), now, now],
      )
      // A retry after a failure puts the order back to "waiting for payment".
      await run(tx, `UPDATE orders SET payment_status = 'pending', updated_at = ? WHERE id = ? AND payment_status = 'failed'`, [now, fresh.id])
    })
    ctx.log.event('payment.initiated', { publicOrderId: fresh.publicId, provider: ctx.payments.name, paymentId, amountMinor: fresh.totalMinor })
    return {
      paymentId,
      provider: ctx.payments.name,
      amountMinor: fresh.totalMinor,
      currency: fresh.currency,
      clientPayload: created.clientPayload,
      alreadyPaid: false,
      order: await toOrderView(ctx.db, (await findOrderById(ctx.db, fresh.id))!),
    }
  })
}

// ---------------------------------------------------------------- events

export type EventOutcome = 'applied' | 'duplicate' | 'ignored' | 'rejected' | 'flagged'

export interface EventResult {
  outcome: EventOutcome
  publicOrderId?: string
  detail?: string
}

/**
 * Applies one verified provider event. Idempotent: the same event id, however
 * many times it arrives, is applied once.
 */
export async function applyPaymentEvent(ctx: AppContext, event: PaymentEvent): Promise<EventResult> {
  let becamePaid: OrderRow | null = null
  const payloadHash = createHash('sha256').update(canonicalJson(event)).digest('hex')
  const nowIso = ctx.now().toISOString()

  const result = await withTx(ctx.db, async (tx): Promise<EventResult> => {
    // Record the event first. A duplicate stops here.
    try {
      await run(tx, `INSERT INTO payment_events (provider, event_id, type, payload_hash, outcome, received_at) VALUES (?, ?, ?, ?, 'received', ?)`, [event.provider, event.eventId, event.type, payloadHash, nowIso])
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'duplicate' }
      throw error
    }
    const settle = (outcome: EventOutcome, detail?: string) => run(tx, 'UPDATE payment_events SET outcome = ? WHERE provider = ? AND event_id = ?', [detail ? `${outcome}:${detail}` : outcome, event.provider, event.eventId])

    // Find the payment attempt this event is about.
    let row =
      event.providerOrderId !== undefined
        ? await queryOne(tx, 'SELECT * FROM payments WHERE provider = ? AND provider_order_id = ?', [event.provider, event.providerOrderId])
        : undefined
    if (!row && event.providerPaymentId) row = await queryOne(tx, 'SELECT * FROM payments WHERE provider = ? AND provider_payment_id = ?', [event.provider, event.providerPaymentId])
    if (!row) {
      await settle('ignored', 'unknown_payment')
      ctx.log.warn('payment.event_unmatched', { provider: event.provider, type: event.type })
      return { outcome: 'ignored', detail: 'unknown_payment' }
    }
    const attempt = rowToAttempt(row as unknown as Record<string, unknown>)
    const order = (await findOrderById(tx, attempt.orderId))!
    const touch = (status: PaymentAttemptStatus, extra: { reason?: string; flag?: string } = {}) =>
      run(tx, `UPDATE payments SET status = ?, provider_payment_id = COALESCE(?, provider_payment_id), failure_reason = COALESCE(?, failure_reason), flag = COALESCE(?, flag), updated_at = ? WHERE id = ?`, [
        status,
        event.providerPaymentId ?? null,
        extra.reason ?? null,
        extra.flag ?? null,
        nowIso,
        attempt.id,
      ])

    switch (event.type) {
      case 'payment.succeeded': {
        if ((event.amountMinor !== undefined && event.amountMinor !== attempt.amountMinor) || (event.currency !== undefined && event.currency !== attempt.currency)) {
          await touch('failed', { reason: 'amount_mismatch', flag: 'amount_mismatch' })
          await settle('rejected', 'amount_mismatch')
          ctx.log.error('payment.amount_mismatch', { publicOrderId: order.publicId, expectedMinor: attempt.amountMinor, receivedMinor: event.amountMinor })
          return { outcome: 'rejected', publicOrderId: order.publicId, detail: 'amount_mismatch' }
        }
        if (attempt.status === 'paid') {
          await settle('ignored', 'already_paid')
          return { outcome: 'ignored', publicOrderId: order.publicId, detail: 'already_paid' }
        }
        if (order.paymentStatus === 'paid') {
          // The order was already settled by another attempt: this customer has been charged twice.
          await touch('paid', { flag: 'duplicate_charge' })
          await settle('flagged', 'duplicate_charge')
          ctx.log.error('payment.duplicate_charge', { publicOrderId: order.publicId, paymentId: attempt.id, amountMinor: attempt.amountMinor })
          return { outcome: 'flagged', publicOrderId: order.publicId, detail: 'duplicate_charge' }
        }
        const paidAfterCancel = order.orderStatus === 'cancelled'
        await touch('paid', paidAfterCancel ? { flag: 'paid_after_cancel' } : {})
        await run(tx, `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed', paid_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, order.id])
        await settle('applied')
        if (paidAfterCancel) ctx.log.error('payment.paid_after_cancel', { publicOrderId: order.publicId, paymentId: attempt.id })
        becamePaid = order
        return { outcome: paidAfterCancel ? 'flagged' : 'applied', publicOrderId: order.publicId, detail: paidAfterCancel ? 'paid_after_cancel' : undefined }
      }

      case 'payment.failed': {
        if (attempt.status === 'paid' || order.paymentStatus === 'paid') {
          await settle('ignored', 'late_failure')
          return { outcome: 'ignored', publicOrderId: order.publicId, detail: 'late_failure' }
        }
        await touch('failed', { reason: event.reason?.slice(0, 200) ?? 'declined' })
        await run(tx, `UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status = 'pending'`, [nowIso, order.id])
        await settle('applied')
        ctx.log.event('payment.failed', { publicOrderId: order.publicId, paymentId: attempt.id, reason: event.reason ?? 'declined' })
        return { outcome: 'applied', publicOrderId: order.publicId }
      }

      case 'payment.cancelled': {
        if (attempt.status === 'paid' || order.paymentStatus === 'paid') {
          await settle('ignored', 'late_cancel')
          return { outcome: 'ignored', publicOrderId: order.publicId, detail: 'late_cancel' }
        }
        await touch('cancelled')
        await settle('applied')
        ctx.log.event('payment.cancelled', { publicOrderId: order.publicId, paymentId: attempt.id })
        return { outcome: 'applied', publicOrderId: order.publicId }
      }

      case 'refund.processed': {
        if (attempt.status !== 'paid') {
          await settle('ignored', 'refund_without_payment')
          return { outcome: 'ignored', publicOrderId: order.publicId, detail: 'refund_without_payment' }
        }
        if (event.amountMinor !== undefined && event.amountMinor < attempt.amountMinor) {
          await touch('paid', { flag: 'partial_refund' })
          await settle('flagged', 'partial_refund')
          ctx.log.warn('payment.partial_refund', { publicOrderId: order.publicId, refundedMinor: event.amountMinor })
          return { outcome: 'flagged', publicOrderId: order.publicId, detail: 'partial_refund' }
        }
        await touch('refunded')
        await run(tx, `UPDATE orders SET payment_status = 'refunded', order_status = 'refunded', updated_at = ? WHERE id = ?`, [nowIso, order.id])
        await settle('applied')
        ctx.log.event('payment.refunded', { publicOrderId: order.publicId, paymentId: attempt.id })
        return { outcome: 'applied', publicOrderId: order.publicId }
      }
    }
  })

  // Side effects run AFTER the state change is safely committed, and can be
  // retried independently — a failure here never un-pays an order.
  if (becamePaid) await onOrderPaid(ctx, becamePaid)
  return result
}

async function onOrderPaid(ctx: AppContext, order: OrderRow): Promise<void> {
  ctx.log.event('payment.succeeded', { publicOrderId: order.publicId, totalMinor: order.totalMinor })
  ctx.log.event('order.confirmed', { publicOrderId: order.publicId })
  try {
    await enqueueNotification(ctx.db, ctx.now(), {
      orderId: order.id,
      channel: ctx.notifier.channel,
      template: 'order_confirmed',
      payload: { publicOrderId: order.publicId, totalMinor: order.totalMinor, currency: order.currency, customerName: order.customerName, mobile: order.customerMobile },
    })
  } catch (error) {
    ctx.log.error('notification.enqueue_failed', { publicOrderId: order.publicId, message: String((error as Error).message) })
  }
  try {
    await generateProductionPackage(ctx, order.id)
  } catch (error) {
    // The order is paid regardless; the package can be regenerated (npm run order:package).
    ctx.log.error('production_package.failed', { publicOrderId: order.publicId, message: String((error as Error).message) })
  }
}

// ---------------------------------------------------------------- entry points

/** A provider webhook: authenticated by the provider, then applied. */
export async function handleWebhook(ctx: AppContext, rawBody: string, headers: { get(name: string): string | null | undefined }): Promise<EventResult[]> {
  const events = ctx.payments.parseWebhook(rawBody, headers)
  const results: EventResult[] = []
  for (const event of events) results.push(await applyPaymentEvent(ctx, event))
  return results
}

/** The browser reporting a signed result (Razorpay's checkout handler). */
export async function confirmClientPayment(ctx: AppContext, publicId: string, token: string | undefined, paymentId: string, payload: unknown): Promise<OrderView> {
  const order = await authorizeOrder(ctx, publicId, token)
  const attempt = await attemptById(ctx.db, paymentId)
  if (!attempt || attempt.orderId !== order.id) throw errors.notFound('That payment')
  if (!ctx.payments.verifyClientConfirmation) throw errors.badRequest('This payment method has no browser confirmation.')

  const event = ctx.payments.verifyClientConfirmation(attempt.providerOrderId, payload)
  await applyPaymentEvent(ctx, event)
  return toOrderView(ctx.db, (await findOrderByPublicId(ctx.db, publicId))!)
}

/** Sandbox only: play out the outcome a real gateway would report. */
export async function resolveSandboxPayment(ctx: AppContext, paymentId: string, outcome: 'succeed' | 'fail' | 'cancel'): Promise<EventResult> {
  if (ctx.payments.name !== 'sandbox') throw errors.notFound()
  const attempt = await attemptById(ctx.db, paymentId)
  if (!attempt) throw errors.notFound('That payment')
  const type = outcome === 'succeed' ? 'payment.succeeded' : outcome === 'fail' ? 'payment.failed' : 'payment.cancelled'
  // Deterministic per (payment, outcome): pressing the same button twice is one event.
  const event: PaymentEvent = {
    provider: 'sandbox',
    eventId: `sbx_evt_${paymentId}_${outcome}`,
    type,
    providerOrderId: attempt.providerOrderId,
    providerPaymentId: `sbx_pay_${paymentId}`,
    amountMinor: attempt.amountMinor,
    currency: attempt.currency,
    reason: outcome === 'fail' ? 'Sandbox: simulated decline' : undefined,
  }
  return applyPaymentEvent(ctx, event)
}

export async function listAttempts(ctx: Pick<AppContext, 'db'>, orderId: number): Promise<PaymentAttempt[]> {
  return (await query(ctx.db, 'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at, rowid', [orderId])).map((r) => rowToAttempt(r as unknown as Record<string, unknown>))
}

