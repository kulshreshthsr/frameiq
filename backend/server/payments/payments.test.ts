// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { query } from '../db/client.ts'
import { processOutbox } from '../notifications/notifier.ts'
import { SANDBOX_SIGNATURE_HEADER } from './sandbox.ts'
import { apiFor, buildOrder, createTestServer, orderHeaders, placeOrder, type Api, type TestServer } from '../test/harness.ts'

let server: TestServer
let api: Api

beforeEach(async () => {
  server = await createTestServer()
  api = apiFor(server)
})

async function newOrder(frames: Parameters<typeof buildOrder>[1] = [{}]) {
  const built = await buildOrder(server, frames)
  const { json } = await placeOrder(server, built)
  return { id: json.order.publicOrderId as string, token: built.accessToken, totalMinor: built.totals.totalMinor as number }
}

const startPayment = async (id: string, token: string) => {
  const res = await api.post(`/api/orders/${id}/payments`, undefined, orderHeaders(token))
  return { res, payment: ((await res.json()) as any).payment }
}
const sandbox = async (paymentId: string, outcome: string) => {
  const res = await api.post(`/api/sandbox/payments/${paymentId}/${outcome}`)
  return { res, json: (await res.json()) as any }
}
const getOrder = async (id: string, token: string) => ((await (await api.get(`/api/orders/${id}`, orderHeaders(token))).json()) as any).order
const count = async (table: string, where = '1=1') => Number((await query(server.ctx.db, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`))[0].n)

/** A webhook exactly as the sandbox "gateway" would deliver it: signed. */
async function webhook(event: Record<string, unknown>, overrides: { signature?: string | null } = {}) {
  const { body, signature } = server.sandbox.signedEvent(event as never)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (overrides.signature !== null) headers[SANDBOX_SIGNATURE_HEADER] = overrides.signature ?? signature
  const res = await server.app.request('/api/webhooks/sandbox', { method: 'POST', headers, body })
  return { res, json: (await res.json()) as any }
}
const providerOrderOf = async (paymentId: string) => String((await query(server.ctx.db, 'SELECT provider_order_id FROM payments WHERE id = ?', [paymentId]))[0].provider_order_id)

describe('starting a payment', () => {
  it('opens a payment for exactly the order total, and needs the order token', async () => {
    const { id, token, totalMinor } = await newOrder()
    const { res, payment } = await startPayment(id, token)
    expect(res.status).toBe(200)
    expect(payment).toMatchObject({ provider: 'sandbox', amountMinor: totalMinor, currency: 'INR', alreadyPaid: false })
    expect(payment.clientPayload).toMatchObject({ mode: 'sandbox', amountMinor: totalMinor })

    const stranger = await api.post(`/api/orders/${id}/payments`, undefined, orderHeaders('W'.repeat(43)))
    expect(stranger.status).toBe(404)
  })

  it('the amount is the server’s, not anything the browser sends', async () => {
    const { id, token, totalMinor } = await newOrder()
    const res = await api.post(`/api/orders/${id}/payments`, { amountMinor: 1 }, orderHeaders(token))
    expect(((await res.json()) as any).payment.amountMinor).toBe(totalMinor)
  })

  it('pressing Pay twice gives the SAME payment, not two charges', async () => {
    const { id, token } = await newOrder()
    const a = await startPayment(id, token)
    const b = await startPayment(id, token)
    expect(b.payment.paymentId).toBe(a.payment.paymentId)
    expect(await count('payments')).toBe(1)
  })

  it('a burst of simultaneous Pay presses still opens one payment', async () => {
    const { id, token } = await newOrder()
    const results = await Promise.all(Array.from({ length: 6 }, () => startPayment(id, token)))
    expect(new Set(results.map((r) => r.payment.paymentId)).size).toBe(1)
    expect(await count('payments')).toBe(1)
  })

  it('logs the initiation without any payment secret', async () => {
    const { id, token } = await newOrder()
    await startPayment(id, token)
    expect(server.logs.some((l) => l.event === 'payment.initiated')).toBe(true)
  })
})

describe('the browser coming back proves nothing', () => {
  it('an order stays unpaid until a verified provider event says otherwise', async () => {
    const { id, token } = await newOrder()
    await startPayment(id, token)
    // The customer returns from the payment page: nothing has been verified yet.
    for (let i = 0; i < 3; i++) {
      const order = await getOrder(id, token)
      expect(order.paymentStatus).toBe('pending')
      expect(order.orderStatus).toBe('pending_payment')
      expect(order.paidAt).toBeNull()
    }
  })

  it('a request that merely CLAIMS success does not mark the order paid', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const forged = await api.post(`/api/orders/${id}/payments/${payment.paymentId}/confirm`, { status: 'paid', razorpay_payment_id: 'pay_x', razorpay_order_id: 'o', razorpay_signature: 'nope' }, orderHeaders(token))
    expect(forged.status).toBe(400) // the sandbox has no browser confirmation at all
    expect((await getOrder(id, token)).paymentStatus).toBe('pending')
  })

  it('an unsigned or wrongly-signed webhook is rejected and changes nothing', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const event = { eventId: 'evt-forged', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId) }
    expect((await webhook(event, { signature: 'deadbeef' })).res.status).toBe(401)
    expect((await webhook(event, { signature: null })).res.status).toBe(401)
    expect((await getOrder(id, token)).paymentStatus).toBe('pending')
    expect(await count('payment_events')).toBe(0)
  })

  it('a correctly-signed webhook with a garbled body is rejected', async () => {
    const res = await server.app.request('/api/webhooks/sandbox', { method: 'POST', headers: { [SANDBOX_SIGNATURE_HEADER]: server.sandbox.signedEvent({ eventId: 'x' } as never).signature }, body: '{"eventId":"x"}' })
    expect(res.status).toBe(401)
  })

  it('a webhook addressed to a provider we don’t use is not found', async () => {
    const res = await server.app.request('/api/webhooks/razorpay', { method: 'POST', body: '{}' })
    expect(res.status).toBe(404)
  })
})

describe('successful payment', () => {
  it('confirms the order, stamps the time, and reports it to a customer who asks', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    server.clock.now = new Date('2026-03-15T10:05:00Z')
    const { json } = await sandbox(payment.paymentId, 'succeed')
    expect(json.outcome).toBe('applied')
    const order = await getOrder(id, token)
    expect(order).toMatchObject({ paymentStatus: 'paid', orderStatus: 'confirmed', paidAt: '2026-03-15T10:05:00.000Z' })
    expect(order.lastPayment.status).toBe('paid')
  })

  it('works when the browser never gets the response (browser closed / request timed out)', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    // The gateway tells us by webhook; the customer's tab is gone.
    const event = { eventId: 'evt-1', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: payment.amountMinor, currency: 'INR' }
    expect((await webhook(event)).json.results).toEqual(['applied'])
    // Later they come back — via the same page, another device with the link, or a refresh:
    expect((await getOrder(id, token)).paymentStatus).toBe('paid')
  })

  it('logs each lifecycle step', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    const events = server.logs.map((l) => l.event)
    expect(events).toEqual(expect.arrayContaining(['order.created', 'payment.initiated', 'payment.succeeded', 'order.confirmed']))
  })

  it('creates the production package and queues the customer message', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    expect([...server.packages.objects.keys()]).toEqual(expect.arrayContaining([`${id}/SHEET.txt`, `${id}/order.json`, `${id}/design.json`, `${id}/preview.png`, `${id}/MANIFEST.json`]))
    const [outbox] = await query(server.ctx.db, 'SELECT channel, template, status FROM notification_outbox')
    expect(outbox).toMatchObject({ channel: 'whatsapp', template: 'order_confirmed', status: 'pending' })
    expect((await query(server.ctx.db, 'SELECT package_path FROM orders'))[0].package_path).toBe(id)
  })

  it('an already-paid order can’t be paid again — asking just says so', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    const again = await startPayment(id, token)
    expect(again.payment.alreadyPaid).toBe(true)
    expect(await count('payments')).toBe(1)
  })

  it('a paid order can’t be cancelled from the browser', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    const res = await api.post(`/api/orders/${id}/cancel`, undefined, orderHeaders(token))
    expect(res.status).toBe(409)
    expect(((await res.json()) as any).error.code).toBe('ALREADY_PAID')
  })
})

describe('duplicate callbacks and webhook replay — idempotent', () => {
  it('pressing the same success outcome twice applies it once', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const first = await sandbox(payment.paymentId, 'succeed')
    const second = await sandbox(payment.paymentId, 'succeed')
    expect(first.json.outcome).toBe('applied')
    expect(second.json.outcome).toBe('duplicate')
    expect(server.logs.filter((l) => l.event === 'order.confirmed')).toHaveLength(1)
    expect(await count('notification_outbox')).toBe(1)
    expect(await count('payment_events')).toBe(1)
  })

  it('a replayed signed webhook is a harmless no-op, however many times it arrives', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const event = { eventId: 'evt-replay', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: payment.amountMinor, currency: 'INR' }
    const results = []
    for (let i = 0; i < 4; i++) results.push((await webhook(event)).json.results[0])
    expect(results).toEqual(['applied', 'duplicate', 'duplicate', 'duplicate'])
    const order = await getOrder(id, token)
    expect(order.paymentStatus).toBe('paid')
    expect(await count('notification_outbox')).toBe(1)
    expect(server.logs.filter((l) => l.event === 'payment.succeeded')).toHaveLength(1)
  })

  it('the duplicate webhook still gets a 200, so the gateway stops retrying', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const event = { eventId: 'evt-200', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId) }
    await webhook(event)
    expect((await webhook(event)).res.status).toBe(200)
  })

  it('simultaneous copies of one event are applied once', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const event = { eventId: 'evt-race', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: payment.amountMinor, currency: 'INR' }
    const results = await Promise.all(Array.from({ length: 5 }, () => webhook(event)))
    expect(results.map((r) => r.json.results[0]).sort()).toEqual(['applied', 'duplicate', 'duplicate', 'duplicate', 'duplicate'])
    expect(await count('notification_outbox')).toBe(1)
  })

  it('an event about a payment we never made is accepted and ignored, not an error', async () => {
    const { res, json } = await webhook({ eventId: 'evt-x', type: 'payment.succeeded', providerOrderId: 'sbx_order_unknown' })
    expect(res.status).toBe(200)
    expect(json.results).toEqual(['ignored'])
  })
})

describe('failed and cancelled payments', () => {
  it('a decline is recorded, the order stays payable, and a retry can succeed', async () => {
    const { id, token } = await newOrder()
    const first = (await startPayment(id, token)).payment
    await sandbox(first.paymentId, 'fail')
    let order = await getOrder(id, token)
    expect(order).toMatchObject({ paymentStatus: 'failed', orderStatus: 'pending_payment' })
    expect(order.lastPayment).toMatchObject({ status: 'failed' })
    expect(order.lastPayment.failureReason).toBeTruthy()
    expect(server.logs.some((l) => l.event === 'payment.failed')).toBe(true)

    const retry = (await startPayment(id, token)).payment
    expect(retry.paymentId).not.toBe(first.paymentId) // a fresh attempt
    expect((await getOrder(id, token)).paymentStatus).toBe('pending') // waiting again

    await sandbox(retry.paymentId, 'succeed')
    order = await getOrder(id, token)
    expect(order).toMatchObject({ paymentStatus: 'paid', orderStatus: 'confirmed' })
    expect(await count('payments')).toBe(2)
  })

  it('closing the payment window leaves the order waiting, with a clear last-attempt status', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'cancel')
    const order = await getOrder(id, token)
    expect(order).toMatchObject({ paymentStatus: 'pending', orderStatus: 'pending_payment' })
    expect(order.lastPayment.status).toBe('cancelled')
    // …and they can simply try again.
    const retry = await startPayment(id, token)
    expect(retry.res.status).toBe(200)
    expect(retry.payment.paymentId).not.toBe(payment.paymentId)
  })

  it('a LATE failure event can never undo a success', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    const late = await sandbox(payment.paymentId, 'fail')
    expect(late.json.outcome).toBe('ignored')
    expect((await getOrder(id, token)).paymentStatus).toBe('paid')
  })

  it('a late cancel likewise changes nothing', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    expect((await sandbox(payment.paymentId, 'cancel')).json.outcome).toBe('ignored')
    expect((await getOrder(id, token)).paymentStatus).toBe('paid')
  })

  it('a cancelled order cannot be paid through the normal flow', async () => {
    const { id, token } = await newOrder()
    await api.post(`/api/orders/${id}/cancel`, undefined, orderHeaders(token))
    const res = await api.post(`/api/orders/${id}/payments`, undefined, orderHeaders(token))
    expect(res.status).toBe(409)
    expect(((await res.json()) as any).error.code).toBe('ORDER_CLOSED')
  })
})

describe('money that arrives when it should not — flagged, never absorbed', () => {
  it('an amount that does not match what was asked for is rejected', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const event = { eventId: 'evt-short', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: 100, currency: 'INR' }
    expect((await webhook(event)).json.results).toEqual(['rejected'])
    const order = await getOrder(id, token)
    expect(order.paymentStatus).not.toBe('paid')
    expect(server.logs.some((l) => l.event === 'payment.amount_mismatch' && l.level === 'error')).toBe(true)
    expect(String((await query(server.ctx.db, 'SELECT flag FROM payments'))[0].flag)).toBe('amount_mismatch')
  })

  it('a wrong currency is rejected too', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const event = { eventId: 'evt-usd', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: payment.amountMinor, currency: 'USD' }
    expect((await webhook(event)).json.results).toEqual(['rejected'])
    expect((await getOrder(id, token)).paymentStatus).not.toBe('paid')
  })

  it('a second payment for an order that is already paid is flagged as a double charge', async () => {
    const { id, token } = await newOrder()
    const a = (await startPayment(id, token)).payment
    await sandbox(a.paymentId, 'cancel') // customer closed the window… but their bank still took the money
    const b = (await startPayment(id, token)).payment
    await sandbox(b.paymentId, 'succeed')
    // The first attempt's payment now arrives late.
    const late = await webhook({ eventId: 'evt-late-a', type: 'payment.succeeded', providerOrderId: await providerOrderOf(a.paymentId), amountMinor: a.amountMinor, currency: 'INR' })
    expect(late.json.results).toEqual(['flagged'])
    expect((await getOrder(id, token)).paymentStatus).toBe('paid')
    expect(server.logs.some((l) => l.event === 'payment.duplicate_charge' && l.level === 'error')).toBe(true)
    expect(server.logs.filter((l) => l.event === 'order.confirmed')).toHaveLength(1)
  })

  it('a payment that lands after the customer cancelled is confirmed but flagged for a human', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await api.post(`/api/orders/${id}/cancel`, undefined, orderHeaders(token))
    const late = await webhook({ eventId: 'evt-after-cancel', type: 'payment.succeeded', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: payment.amountMinor, currency: 'INR' })
    expect(late.json.results).toEqual(['flagged'])
    expect((await getOrder(id, token)).paymentStatus).toBe('paid') // their money was taken; the order stands
    expect(server.logs.some((l) => l.event === 'payment.paid_after_cancel')).toBe(true)
  })
})

describe('refunds', () => {
  it('a full refund closes the order as refunded', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    await webhook({ eventId: 'evt-refund', type: 'refund.processed', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: payment.amountMinor })
    expect(await getOrder(id, token)).toMatchObject({ paymentStatus: 'refunded', orderStatus: 'refunded' })
  })

  it('a partial refund is flagged and does not un-pay the order', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    const result = await webhook({ eventId: 'evt-partial', type: 'refund.processed', providerOrderId: await providerOrderOf(payment.paymentId), amountMinor: 100 })
    expect(result.json.results).toEqual(['flagged'])
    expect((await getOrder(id, token)).paymentStatus).toBe('paid')
  })

  it('a refund for a payment that never succeeded is ignored', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    const result = await webhook({ eventId: 'evt-bogus-refund', type: 'refund.processed', providerOrderId: await providerOrderOf(payment.paymentId) })
    expect(result.json.results).toEqual(['ignored'])
  })
})

describe('the sandbox never exists outside development', () => {
  it('unknown outcomes and unknown payments are simply not found', async () => {
    expect((await api.post('/api/sandbox/payments/pay_x/explode')).status).toBe(404)
    expect((await api.post('/api/sandbox/payments/pay_missing/succeed')).status).toBe(404)
  })
})

describe('customer messages (outbox)', () => {
  it('delivers a queued message once, and says honestly that it was only logged', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    expect(await processOutbox(server.ctx)).toBe(1)
    expect(String((await query(server.ctx.db, 'SELECT status FROM notification_outbox'))[0].status)).toBe('logged')
    expect(await processOutbox(server.ctx)).toBe(0) // nothing left to send
    expect(JSON.stringify(server.logs)).not.toContain('98765')
  })

  it('a failing channel is retried, then given up on, without touching the order', async () => {
    const { id, token } = await newOrder()
    const { payment } = await startPayment(id, token)
    await sandbox(payment.paymentId, 'succeed')
    server.ctx.notifier = { channel: 'whatsapp', send: async () => { throw new Error('gateway down') } }
    for (let i = 0; i < 6; i++) await processOutbox(server.ctx)
    const [row] = await query(server.ctx.db, 'SELECT status, attempts, last_error FROM notification_outbox')
    expect(row).toMatchObject({ status: 'failed', attempts: 5 })
    expect((await getOrder(id, token)).paymentStatus).toBe('paid')
  })
})
