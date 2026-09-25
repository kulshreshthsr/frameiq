import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { AppError } from '../errors.ts'
import { PaymentAuthError, type CreatedPayment, type CreatePaymentInput, type HeaderReader, type PaymentEvent, type PaymentProvider } from './provider.ts'

/**
 * RAZORPAY ADAPTER.
 *
 * Implements the provider interface using Razorpay's documented Orders API,
 * checkout signature scheme and webhook scheme:
 *   - order creation:   POST /v1/orders (basic auth with key id + secret)
 *   - checkout result:  signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
 *   - webhooks:         X-Razorpay-Signature = HMAC-SHA256(raw body, webhook_secret)
 *
 * HONEST STATUS: the signature logic is unit-tested against independently
 * computed HMACs, and the mapping is tested with representative payloads. It
 * has NOT been exercised against Razorpay's live or test servers from this
 * repository, because that needs real credentials. Before launch, run one
 * end-to-end payment in Razorpay's test mode with your own keys.
 */

const API_BASE = 'https://api.razorpay.com/v1'

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const hmacHex = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex')

/** Checks the signature Razorpay Checkout hands the browser after payment. */
export function verifyRazorpayPaymentSignature(keySecret: string, orderId: string, paymentId: string, signature: string): boolean {
  return safeEqual(hmacHex(keySecret, `${orderId}|${paymentId}`), signature)
}

/** Checks a webhook's `X-Razorpay-Signature` against the raw request body. */
export function verifyRazorpayWebhookSignature(webhookSecret: string, rawBody: string, signature: string): boolean {
  return safeEqual(hmacHex(webhookSecret, rawBody), signature)
}

const paymentEntity = z.object({
  id: z.string(),
  order_id: z.string().nullish(),
  amount: z.number().int().optional(),
  currency: z.string().optional(),
  error_description: z.string().nullish(),
})

const webhookSchema = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z.object({ entity: paymentEntity }).optional(),
      refund: z.object({ entity: z.object({ payment_id: z.string(), amount: z.number().int().optional() }) }).optional(),
    })
    .default({}),
})

const clientConfirmSchema = z.object({
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
})

export interface RazorpayCredentials {
  keyId: string
  keySecret: string
  webhookSecret: string
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const
  private readonly credentials: RazorpayCredentials
  private readonly fetchImpl: typeof fetch

  constructor(credentials: RazorpayCredentials, fetchImpl: typeof fetch = fetch) {
    this.credentials = credentials
    this.fetchImpl = fetchImpl
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const auth = Buffer.from(`${this.credentials.keyId}:${this.credentials.keySecret}`).toString('base64')
    let response: Response
    try {
      response = await this.fetchImpl(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: input.amountMinor,
          currency: input.currency,
          receipt: input.publicOrderId,
          notes: { order: input.publicOrderId },
        }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new AppError('PAYMENT_UNAVAILABLE', 503, 'We couldn’t reach the payment service. Nothing was charged — please try again.')
    }
    if (!response.ok) {
      throw new AppError('PAYMENT_UNAVAILABLE', 503, 'We couldn’t start the payment. Nothing was charged — please try again.')
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new AppError('PAYMENT_UNAVAILABLE', 503, 'We couldn’t start the payment. Nothing was charged — please try again.')

    return {
      providerOrderId: body.id,
      clientPayload: {
        mode: 'razorpay',
        keyId: this.credentials.keyId,
        providerOrderId: body.id,
        amountMinor: input.amountMinor,
        currency: input.currency,
        prefill: { name: input.customerName, contact: input.customerMobile },
      },
    }
  }

  parseWebhook(rawBody: string, headers: HeaderReader): PaymentEvent[] {
    const signature = headers.get('x-razorpay-signature') ?? ''
    if (!verifyRazorpayWebhookSignature(this.credentials.webhookSecret, rawBody, signature)) throw new PaymentAuthError()

    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      throw new PaymentAuthError('Malformed payment notification')
    }
    const parsed = webhookSchema.safeParse(json)
    if (!parsed.success) throw new PaymentAuthError('Malformed payment notification')

    const eventId = headers.get('x-razorpay-event-id')
    if (!eventId) throw new PaymentAuthError('Payment notification has no event id')

    const { event, payload } = parsed.data
    const payment = payload.payment?.entity

    const base = {
      provider: 'razorpay',
      eventId,
      providerOrderId: payment?.order_id ?? undefined,
      providerPaymentId: payment?.id,
      amountMinor: payment?.amount,
      currency: payment?.currency,
    }

    switch (event) {
      case 'payment.captured':
      case 'order.paid':
        return payment ? [{ ...base, type: 'payment.succeeded' }] : []
      case 'payment.failed':
        return payment ? [{ ...base, type: 'payment.failed', reason: payment.error_description ?? undefined }] : []
      case 'refund.processed': {
        const refund = payload.refund?.entity
        return refund ? [{ ...base, type: 'refund.processed', providerPaymentId: refund.payment_id, amountMinor: refund.amount }] : []
      }
      default:
        // Events we don't act on (authorised, created, …) are accepted and ignored.
        return []
    }
  }

  verifyClientConfirmation(providerOrderId: string, payload: unknown): PaymentEvent {
    const parsed = clientConfirmSchema.safeParse(payload)
    if (!parsed.success) throw new PaymentAuthError('Malformed payment confirmation')
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = parsed.data
    if (razorpay_order_id !== providerOrderId) throw new PaymentAuthError()
    if (!verifyRazorpayPaymentSignature(this.credentials.keySecret, razorpay_order_id, razorpay_payment_id, razorpay_signature)) throw new PaymentAuthError()
    return {
      provider: 'razorpay',
      // Deterministic, so the same browser confirmation twice is one event.
      eventId: `client:${razorpay_payment_id}`,
      type: 'payment.succeeded',
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
    }
  }
}
