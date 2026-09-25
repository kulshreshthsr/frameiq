import { create } from 'zustand'
import { emptyCustomerForm, emptyDeliveryForm, type CustomerForm, type DeliveryForm } from '../../shared/customerRules'
import type { DesignSnapshot, OrderView } from '../../shared/orderSchema'
import type { ImageProblem } from '../../shared/production'
import type { ServerConfig, StartedPayment } from '../order/api'

/**
 * The customer's progress through ordering. It holds the FROZEN design
 * snapshot — once checkout begins, what is being bought cannot change under
 * the customer's feet — plus what they've typed, and how far the order and
 * payment have got.
 */

export type CheckoutStage = 'review' | 'details' | 'delivery' | 'payment' | 'confirmation'

export const CHECKOUT_STAGES: { id: CheckoutStage; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'details', label: 'Your details' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Done' },
]

/** Where payment has got to — this is what the payment screen explains. */
export type PaymentPhase =
  | 'idle'
  | 'checking' // checking photos
  | 'uploading' // sending photos
  | 'creating' // creating the order
  | 'opening' // opening the payment
  | 'awaiting' // the customer is paying
  | 'verifying' // we're confirming with the provider
  | 'unconfirmed' // couldn't confirm yet — DON'T pay again
  | 'failed' // payment declined
  | 'cancelled' // customer closed the payment
  | 'error' // something before payment went wrong
  | 'success' // paid — confirmed by the server

export interface CheckoutProblem {
  code: string
  message: string
  /** Extra facts for the screen (which frames, the new price…). */
  details?: unknown
}

export interface UploadedIds {
  wall?: string
  preview?: string
  photos: Record<string, string>
}

export interface CheckoutState {
  active: boolean
  stage: CheckoutStage
  snapshot: DesignSnapshot | null
  digest: string | null
  /** Object URL of the final-design preview (not persisted). */
  previewUrl: string | null

  customer: CustomerForm
  delivery: DeliveryForm
  /** True once a field has been left, so errors show after — not while — typing. */
  touched: Record<string, boolean>

  idempotencyKey: string | null
  accessToken: string | null
  uploads: UploadedIds
  /** Assets whose original the customer re-supplied here. */
  replacedAssetIds: string[]
  imageProblems: ImageProblem[]

  order: OrderView | null
  phase: PaymentPhase
  problem: CheckoutProblem | null
  uploadProgress: { done: number; total: number }
  /** The open sandbox payment, while the test-payment dialog is up. */
  sandboxPayment: StartedPayment | null
  serverConfig: ServerConfig | null

  patch: (partial: Partial<CheckoutState>) => void
  setCustomerField: (field: keyof CustomerForm, value: string) => void
  setDeliveryField: (field: keyof DeliveryForm, value: string) => void
  touch: (field: string) => void
  reset: () => void
}

const initial = {
  active: false,
  stage: 'review' as CheckoutStage,
  snapshot: null,
  digest: null,
  previewUrl: null,
  customer: emptyCustomerForm(),
  delivery: emptyDeliveryForm(),
  touched: {} as Record<string, boolean>,
  idempotencyKey: null,
  accessToken: null,
  uploads: { photos: {} } as UploadedIds,
  replacedAssetIds: [] as string[],
  imageProblems: [] as ImageProblem[],
  order: null,
  phase: 'idle' as PaymentPhase,
  problem: null,
  uploadProgress: { done: 0, total: 0 },
  sandboxPayment: null,
}

export const useCheckoutStore = create<CheckoutState>((set) => ({
  ...initial,
  serverConfig: null,

  patch: (partial) => set(partial),
  setCustomerField: (field, value) => set((s) => ({ customer: { ...s.customer, [field]: value } })),
  setDeliveryField: (field, value) => set((s) => ({ delivery: { ...s.delivery, [field]: value } })),
  touch: (field) => set((s) => ({ touched: { ...s.touched, [field]: true } })),
  // Keeps the (session-long) server config; everything about an order is dropped.
  reset: () => set((s) => ({ ...initial, customer: emptyCustomerForm(), delivery: emptyDeliveryForm(), touched: {}, uploads: { photos: {} }, serverConfig: s.serverConfig })),
}))
