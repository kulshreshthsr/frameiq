/**
 * THE PAYMENT PROVIDER SEAM.
 *
 * The rest of the server talks to payments only through this interface, and
 * in terms of provider-neutral events. A provider's job is to (1) open a
 * payment for an order, and (2) turn what the provider tells us — a webhook,
 * or the customer's browser reporting back — into a `PaymentEvent` after
 * VERIFYING it really came from the provider. Nothing else in the system
 * decides an order is paid; only a verified event can.
 *
 * Swapping Razorpay for another gateway means writing one more class here.
 */

export type PaymentEventType = 'payment.succeeded' | 'payment.failed' | 'payment.cancelled' | 'refund.processed'

export interface PaymentEvent {
  provider: string
  /** Unique per event at the provider; the key that makes replays harmless. */
  eventId: string
  type: PaymentEventType
  providerOrderId?: string
  providerPaymentId?: string
  amountMinor?: number
  currency?: string
  reason?: string
}

export interface CreatePaymentInput {
  publicOrderId: string
  amountMinor: number
  currency: string
  customerName: string
  customerMobile: string
}

export interface CreatedPayment {
  providerOrderId: string
  /** Everything the browser needs to complete payment with this provider. */
  clientPayload: Record<string, unknown>
}

export interface HeaderReader {
  get(name: string): string | null | undefined
}

/** Thrown when a webhook or confirmation can't be authenticated. */
export class PaymentAuthError extends Error {
  constructor(message = 'Payment notification could not be verified') {
    super(message)
    this.name = 'PaymentAuthError'
  }
}

export interface PaymentProvider {
  readonly name: 'sandbox' | 'razorpay'
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>
  /** Verifies a webhook's authenticity and converts it to events. Throws PaymentAuthError. */
  parseWebhook(rawBody: string, headers: HeaderReader): PaymentEvent[]
  /** For providers whose browser SDK reports back with a signed result. */
  verifyClientConfirmation?(providerOrderId: string, payload: unknown): PaymentEvent
}
