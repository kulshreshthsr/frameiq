// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { PaymentAuthError } from './provider.ts'
import { RazorpayProvider, verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from './razorpay.ts'

/**
 * These tests check the adapter against signatures computed INDEPENDENTLY
 * here (plain node:crypto, following Razorpay's documented scheme), so they
 * would catch a wrong algorithm, a wrong key, or a wrong message layout.
 * They do not — cannot — prove the live Razorpay service accepts our
 * requests; see the note at the top of razorpay.ts.
 */

const creds = { keyId: 'rzp_test_abc123', keySecret: 'key-secret-value', webhookSecret: 'webhook-secret-value' }
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex')
const headers = (map: Record<string, string>) => ({ get: (name: string) => map[name.toLowerCase()] })

describe('checkout signature (browser reports back)', () => {
  it('accepts exactly HMAC-SHA256(order_id|payment_id, key_secret)', () => {
    const signature = hmac(creds.keySecret, 'order_ABC|pay_XYZ')
    expect(verifyRazorpayPaymentSignature(creds.keySecret, 'order_ABC', 'pay_XYZ', signature)).toBe(true)
  })

  it('rejects a tampered order id, payment id, key, or signature', () => {
    const signature = hmac(creds.keySecret, 'order_ABC|pay_XYZ')
    expect(verifyRazorpayPaymentSignature(creds.keySecret, 'order_OTHER', 'pay_XYZ', signature)).toBe(false)
    expect(verifyRazorpayPaymentSignature(creds.keySecret, 'order_ABC', 'pay_OTHER', signature)).toBe(false)
    expect(verifyRazorpayPaymentSignature('wrong-key', 'order_ABC', 'pay_XYZ', signature)).toBe(false)
    expect(verifyRazorpayPaymentSignature(creds.keySecret, 'order_ABC', 'pay_XYZ', signature.replace(/.$/, '0'))).toBe(false)
    expect(verifyRazorpayPaymentSignature(creds.keySecret, 'order_ABC', 'pay_XYZ', '')).toBe(false)
    expect(verifyRazorpayPaymentSignature(creds.keySecret, 'order_ABC', 'pay_XYZ', 'short')).toBe(false)
  })

  it('does not accept a webhook-secret signature in its place', () => {
    const wrongSecret = hmac(creds.webhookSecret, 'order_ABC|pay_XYZ')
    expect(verifyRazorpayPaymentSignature(creds.keySecret, 'order_ABC', 'pay_XYZ', wrongSecret)).toBe(false)
  })
})

describe('webhook signature', () => {
  const body = '{"event":"payment.captured"}'

  it('accepts HMAC-SHA256(raw body, webhook_secret)', () => {
    expect(verifyRazorpayWebhookSignature(creds.webhookSecret, body, hmac(creds.webhookSecret, body))).toBe(true)
  })

  it('rejects any change to the body, even whitespace', () => {
    const signature = hmac(creds.webhookSecret, body)
    expect(verifyRazorpayWebhookSignature(creds.webhookSecret, body + ' ', signature)).toBe(false)
    expect(verifyRazorpayWebhookSignature(creds.webhookSecret, body.replace('captured', 'failed'), signature)).toBe(false)
  })

  it('rejects the wrong secret and a missing signature', () => {
    expect(verifyRazorpayWebhookSignature('nope', body, hmac(creds.webhookSecret, body))).toBe(false)
    expect(verifyRazorpayWebhookSignature(creds.webhookSecret, body, '')).toBe(false)
  })
})

describe('mapping webhooks to events', () => {
  const provider = new RazorpayProvider(creds)
  const deliver = (payload: unknown, eventId: string | null = 'evt_1', signWith = creds.webhookSecret) => {
    const raw = JSON.stringify(payload)
    const map: Record<string, string> = { 'x-razorpay-signature': hmac(signWith, raw) }
    if (eventId) map['x-razorpay-event-id'] = eventId
    return provider.parseWebhook(raw, headers(map))
  }
  const payment = { entity: { id: 'pay_1', order_id: 'order_1', amount: 84800, currency: 'INR' } }

  it('payment.captured → payment.succeeded, carrying the amount to be checked', () => {
    expect(deliver({ event: 'payment.captured', payload: { payment } })).toEqual([
      { provider: 'razorpay', eventId: 'evt_1', type: 'payment.succeeded', providerOrderId: 'order_1', providerPaymentId: 'pay_1', amountMinor: 84800, currency: 'INR' },
    ])
  })

  it('order.paid is also a success', () => {
    expect(deliver({ event: 'order.paid', payload: { payment } })[0].type).toBe('payment.succeeded')
  })

  it('payment.failed → payment.failed with the gateway’s reason', () => {
    const [event] = deliver({ event: 'payment.failed', payload: { payment: { entity: { ...payment.entity, error_description: 'Card declined' } } } })
    expect(event).toMatchObject({ type: 'payment.failed', reason: 'Card declined' })
  })

  it('refund.processed → refund.processed for the right payment', () => {
    const [event] = deliver({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_1', amount: 84800 } }, payment } })
    expect(event).toMatchObject({ type: 'refund.processed', providerPaymentId: 'pay_1', amountMinor: 84800 })
  })

  it('events we do not act on are accepted and produce nothing', () => {
    expect(deliver({ event: 'payment.authorized', payload: { payment } })).toEqual([])
    expect(deliver({ event: 'something.new', payload: {} })).toEqual([])
  })

  it('refuses a webhook signed with the wrong secret', () => {
    expect(() => deliver({ event: 'payment.captured', payload: { payment } }, 'evt_1', 'attacker-secret')).toThrow(PaymentAuthError)
  })

  it('refuses a webhook with no event id (we could not de-duplicate it)', () => {
    expect(() => deliver({ event: 'payment.captured', payload: { payment } }, null)).toThrow(PaymentAuthError)
  })

  it('refuses a validly-signed but garbled body', () => {
    const raw = 'not json'
    expect(() => provider.parseWebhook(raw, headers({ 'x-razorpay-signature': hmac(creds.webhookSecret, raw), 'x-razorpay-event-id': 'e' }))).toThrow(PaymentAuthError)
  })
})

describe('the browser’s signed confirmation', () => {
  const provider = new RazorpayProvider(creds)
  const good = () => ({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: hmac(creds.keySecret, 'order_1|pay_1') })

  it('turns a valid signature into a success event with a stable id (so it de-duplicates)', () => {
    const a = provider.verifyClientConfirmation('order_1', good())
    const b = provider.verifyClientConfirmation('order_1', good())
    expect(a).toMatchObject({ type: 'payment.succeeded', providerOrderId: 'order_1', providerPaymentId: 'pay_1' })
    expect(a.eventId).toBe(b.eventId)
  })

  it('rejects a valid signature presented for a DIFFERENT order', () => {
    expect(() => provider.verifyClientConfirmation('order_2', good())).toThrow(PaymentAuthError)
  })

  it('rejects a forged signature and malformed input', () => {
    expect(() => provider.verifyClientConfirmation('order_1', { ...good(), razorpay_signature: 'forged' })).toThrow(PaymentAuthError)
    expect(() => provider.verifyClientConfirmation('order_1', { status: 'paid' })).toThrow(PaymentAuthError)
    expect(() => provider.verifyClientConfirmation('order_1', null)).toThrow(PaymentAuthError)
  })
})

describe('creating a payment', () => {
  const input = { publicOrderId: 'FRM-2026-000001', amountMinor: 84800, currency: 'INR', customerName: 'Asha', customerMobile: '+919876543210' }

  it('calls the Orders API with basic auth, the exact amount in paise, and our order id as the receipt', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'order_NEW' }), { status: 200 }))
    const result = await new RazorpayProvider(creds, fetchImpl as never).createPayment(input)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.razorpay.com/v1/orders')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`)
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 84800, currency: 'INR', receipt: 'FRM-2026-000001' })
    expect(result.providerOrderId).toBe('order_NEW')
    expect(result.clientPayload).toMatchObject({ mode: 'razorpay', keyId: creds.keyId, providerOrderId: 'order_NEW', amountMinor: 84800 })
  })

  it('never sends the key SECRET to the browser', async () => {
    const provider = new RazorpayProvider(creds, (async () => new Response(JSON.stringify({ id: 'order_NEW' }))) as never)
    const { clientPayload } = await provider.createPayment(input)
    expect(JSON.stringify(clientPayload)).not.toContain(creds.keySecret)
    expect(JSON.stringify(clientPayload)).not.toContain(creds.webhookSecret)
  })

  it('a gateway error becomes a calm "nothing was charged" message', async () => {
    const provider = new RazorpayProvider(creds, (async () => new Response('{"error":{"description":"Authentication failed"}}', { status: 401 })) as never)
    const error = await provider.createPayment(input).catch((e) => e)
    expect(error.code).toBe('PAYMENT_UNAVAILABLE')
    expect(error.message).toMatch(/Nothing was charged/)
    expect(error.message).not.toMatch(/Authentication|401|razorpay/i)
  })

  it('a network failure becomes the same calm message', async () => {
    const provider = new RazorpayProvider(creds, (async () => { throw new TypeError('fetch failed') }) as never)
    expect((await provider.createPayment(input).catch((e) => e)).message).toMatch(/Nothing was charged/)
  })

  it('a response with no order id is treated as a failure', async () => {
    const provider = new RazorpayProvider(creds, (async () => new Response('{}')) as never)
    expect((await provider.createPayment(input).catch((e) => e)).code).toBe('PAYMENT_UNAVAILABLE')
  })
})
