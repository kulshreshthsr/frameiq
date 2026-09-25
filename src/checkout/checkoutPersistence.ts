import { z } from 'zod'
import { designSnapshotSchema, type DesignSnapshot } from '../../shared/orderSchema'
import type { CustomerForm, DeliveryForm } from '../../shared/customerRules'
import { CHECKOUT_STORAGE_KEY } from './savedCheckout'
import { useCheckoutStore, type CheckoutStage, type UploadedIds } from './checkoutStore'

/**
 * Keeps checkout alive across a refresh, a closed tab, or a phone locking
 * mid-payment. What is saved is exactly what is needed to pick up where the
 * customer left off: the frozen design, what they typed, the keys that make
 * order creation safe to repeat, and which order (if any) is in flight.
 *
 * The order's STATE is deliberately not saved — on return we ask the server,
 * because only the server knows whether a payment landed. The final-design
 * preview image lives in IndexedDB (see order/originals).
 */

const STORAGE_KEY = CHECKOUT_STORAGE_KEY
const VERSION = 1

const persistedSchema = z.object({
  version: z.literal(VERSION),
  stage: z.enum(['review', 'details', 'delivery', 'payment', 'confirmation']),
  snapshot: designSnapshotSchema,
  digest: z.string().length(64),
  customer: z.object({ name: z.string().max(300), mobile: z.string().max(60) }),
  delivery: z.object({ line1: z.string().max(400), line2: z.string().max(400), city: z.string().max(300), state: z.string().max(100), pin: z.string().max(30) }),
  idempotencyKey: z.string().min(16).max(80),
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  uploads: z.object({ wall: z.string().optional(), preview: z.string().optional(), photos: z.record(z.string(), z.string()) }),
  replacedAssetIds: z.array(z.string()),
  publicOrderId: z.string().nullable(),
})

export interface PersistedCheckout {
  stage: CheckoutStage
  snapshot: DesignSnapshot
  digest: string
  customer: CustomerForm
  delivery: DeliveryForm
  idempotencyKey: string
  accessToken: string
  uploads: UploadedIds
  replacedAssetIds: string[]
  publicOrderId: string | null
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function saveCheckout(): void {
  const s = useCheckoutStore.getState()
  const store = storage()
  if (!store) return
  if (!s.active || !s.snapshot || !s.digest || !s.idempotencyKey || !s.accessToken) return
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: VERSION,
        stage: s.stage,
        snapshot: s.snapshot,
        digest: s.digest,
        customer: s.customer,
        delivery: s.delivery,
        idempotencyKey: s.idempotencyKey,
        accessToken: s.accessToken,
        uploads: s.uploads,
        replacedAssetIds: s.replacedAssetIds,
        publicOrderId: s.order?.publicOrderId ?? null,
      }),
    )
  } catch {
    /* storage full or blocked: checkout still works, it just won't survive a refresh */
  }
}

/** Reads a saved checkout, or null if there is none or it is unusable. */
export function loadCheckout(): PersistedCheckout | null {
  const store = storage()
  if (!store) return null
  let raw: string | null = null
  try {
    raw = store.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = persistedSchema.safeParse(JSON.parse(raw))
    if (parsed.success) {
      const { version: _version, ...rest } = parsed.data
      return rest
    }
  } catch {
    /* fall through to discard */
  }
  clearCheckout()
  return null
}

export function clearCheckout(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to clear */
  }
}

/**
 * Saves after every change (checkout state is small). Typing is debounced, but
 * the moments that matter — moving between stages, an order being created —
 * are written at once, and anything pending is flushed when the page is
 * hidden, so a refresh can never lose the fact that an order exists.
 * Returns an unsubscribe.
 */
export function startCheckoutAutosave(): () => void {
  saveCheckout() // capture the state we're starting from, not just later changes
  let timer: ReturnType<typeof setTimeout> | undefined
  const marker = () => {
    const s = useCheckoutStore.getState()
    return `${s.stage}|${s.order?.publicOrderId ?? ''}`
  }
  let last = marker()
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    saveCheckout()
  }
  const unsubscribe = useCheckoutStore.subscribe(() => {
    const now = marker()
    if (now !== last) {
      last = now
      flush()
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 150)
  })
  const onHide = () => flush()
  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', onHide)
  return () => {
    if (timer) clearTimeout(timer)
    window.removeEventListener('pagehide', onHide)
    document.removeEventListener('visibilitychange', onHide)
    unsubscribe()
  }
}
