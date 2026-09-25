import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { PaymentAuthError, type CreatedPayment, type CreatePaymentInput, type HeaderReader, type PaymentEvent, type PaymentProvider } from './provider.ts'

/**
 * SANDBOX PAYMENTS — for development and automated tests ONLY.
 *
 * It behaves like a real gateway from the server's point of view: it opens a
 * payment, and later reports an outcome as a SIGNED webhook-style event that
 * goes through exactly the same verification and state machine as a real
 * provider's would. No money moves and no card is involved. Configuration
 * refuses to start in production with this provider (see config.ts).
 */

export const SANDBOX_SIGNATURE_HEADER = 'x-sandbox-signature'

export function signSandboxBody(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

const sandboxEventSchema = z.object({
  eventId: z.string().min(1).max(120),
  type: z.enum(['payment.succeeded', 'payment.failed', 'payment.cancelled', 'refund.processed']),
  providerOrderId: z.string().min(1).max(120),
  providerPaymentId: z.string().max(120).optional(),
  amountMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  reason: z.string().max(200).optional(),
})

export class SandboxProvider implements PaymentProvider {
  readonly name = 'sandbox' as const
  private readonly secret: string
  private readonly randomId: (bytes?: number) => string

  constructor(secret: string, randomId: (bytes?: number) => string) {
    this.secret = secret
    this.randomId = randomId
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const providerOrderId = `sbx_order_${this.randomId(9)}`
    return {
      providerOrderId,
      clientPayload: {
        mode: 'sandbox',
        providerOrderId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        notice: 'Test payment — no real money is charged.',
      },
    }
  }

  parseWebhook(rawBody: string, headers: HeaderReader): PaymentEvent[] {
    const supplied = headers.get(SANDBOX_SIGNATURE_HEADER) ?? ''
    const expected = signSandboxBody(this.secret, rawBody)
    const a = Buffer.from(supplied)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PaymentAuthError()

    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      throw new PaymentAuthError('Malformed payment notification')
    }
    const parsed = sandboxEventSchema.safeParse(json)
    if (!parsed.success) throw new PaymentAuthError('Malformed payment notification')
    return [{ provider: 'sandbox', ...parsed.data }]
  }

  /** Builds a signed body, as the sandbox "gateway" would send it. */
  signedEvent(event: Omit<PaymentEvent, 'provider'>): { body: string; signature: string } {
    const body = JSON.stringify(event)
    return { body, signature: signSandboxBody(this.secret, body) }
  }
}
