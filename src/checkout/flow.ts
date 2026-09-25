import { validateCustomerForm, validateDeliveryForm } from '../../shared/customerRules'
import { computeOrderTotals } from '../../shared/pricing'
import type { CreateOrderRequest, OrderView } from '../../shared/orderSchema'
import { currentCatalog } from '../domain/catalog'
import { validateImageFile } from '../lib/imageValidation'
import { discardDraft, startNewDesign } from '../persistence/draftSync'
import { useCompositionStore } from '../state/compositionStore'
import { useJourneyStore } from '../state/journeyStore'
import { useUIStore } from '../state/uiStore'
import { api, isApiError, type ApiError, type StartedPayment } from '../order/api'
import { syncCatalog } from '../order/catalogSync'
import { loadOriginal, previewKey, saveOriginal } from '../order/originals'
import { newAccessToken, newIdempotencyKey } from '../order/secrets'
import { buildDesignSnapshot, isValidSnapshot, snapshotDigest } from '../order/snapshot'
import { checkOriginals, measureImage } from '../order/verifyImages'
import { clearCheckout, loadCheckout } from './checkoutPersistence'
import { useCheckoutStore, type CheckoutProblem, type CheckoutStage } from './checkoutStore'
import { openRazorpay } from './razorpay'

/**
 * THE ORDERING FLOW — everything between "Continue to order" and "your order
 * is confirmed". It coordinates the stores, the API, and the payment provider,
 * and it is where each failure gets a deliberate, plain-language outcome.
 *
 * Principles:
 *  - The frozen snapshot is the only design checkout ever looks at.
 *  - Nothing is "paid" because the browser says so; we ask the server.
 *  - Every step can be repeated safely (uploads are content-addressed, order
 *    creation is idempotent, opening a payment reuses an open one), so any
 *    failure can offer a plain "Try again" without risking a duplicate.
 *  - If we are unsure whether the customer was charged, we say so and tell
 *    them NOT to pay again.
 */

const state = () => useCheckoutStore.getState()
const patch = (partial: Parameters<ReturnType<typeof state>['patch']>[0]) => state().patch(partial)

// Polling cadence for "did the payment land?" — overridable so tests run fast.
let pollDelaysMs = [700, 1000, 1500, 2000, 2500, 3000, 3000, 4000, 4000, 5000]
export function setPollDelaysForTests(delays: number[]) {
  pollDelaysMs = delays
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const MESSAGES = {
  catalogUnavailable: 'We can’t reach our ordering system right now. Your design is saved — please try again in a moment.',
  previewFailed: 'We couldn’t prepare your design preview. Your design is safe — please try again.',
  itemsUnavailable: 'Some frames in your design aren’t available as chosen. Please go back and choose another style or size.',
  connection: 'We couldn’t reach our servers, so nothing was charged. Please check your connection and try again.',
  generic: 'Something went wrong on our side. Nothing was charged — please try again in a moment.',
  unconfirmed: 'We haven’t been able to confirm your payment yet. If you’ve already paid, it will be applied to your order as soon as we hear back. You can check again in a moment.',
} as const

// ---------------------------------------------------------------- setup

export async function loadServerConfig(): Promise<void> {
  if (state().serverConfig) return
  try {
    patch({ serverConfig: await api.config() })
  } catch {
    /* the payment step will explain if it matters */
  }
}


// ---------------------------------------------------------------- begin

export type BeginResult = { ok: true } | { ok: false; message: string }

/**
 * "Continue to order": freeze the design, render its preview, and open
 * checkout. Returns a customer-facing message if it can't.
 */
export async function beginCheckout(renderPreview: () => Promise<Blob>): Promise<BeginResult> {
  if (!(await syncCatalog())) return { ok: false, message: MESSAGES.catalogUnavailable }
  void loadServerConfig()

  const composition = useCompositionStore.getState()
  if (!composition.wall || composition.frames.length === 0) return { ok: false, message: 'There’s nothing to order yet. Add a frame first.' }
  if (computeOrderTotals(currentCatalog(), composition.frames).unpricedFrameIds.length > 0) return { ok: false, message: MESSAGES.itemsUnavailable }

  let preview: Blob
  try {
    preview = await renderPreview()
  } catch {
    return { ok: false, message: MESSAGES.previewFailed }
  }

  const snapshot = buildDesignSnapshot({
    wall: composition.wall,
    wallWidthCm: composition.wallWidthCm,
    placementMode: composition.placementMode,
    wallRegion: composition.wallRegion,
    layoutId: composition.activeLayoutId,
    frames: composition.frames,
    catalog: currentCatalog(),
    now: new Date(),
    appVersion: __APP_VERSION__,
  })
  if (!isValidSnapshot(snapshot)) return { ok: false, message: MESSAGES.generic }

  const digest = await snapshotDigest(snapshot)
  await saveOriginal(previewKey(digest), preview)

  state().reset()
  patch({
    active: true,
    stage: 'review',
    snapshot,
    digest,
    previewUrl: URL.createObjectURL(preview),
    idempotencyKey: newIdempotencyKey(),
    accessToken: newAccessToken(),
  })
  api.track('checkout.started', { frames: snapshot.frames.length, totalMinor: snapshot.pricing.totalMinor })
  await verifyOriginals()
  return { ok: true }
}

// ---------------------------------------------------------------- images

async function replacementBlobs(): Promise<Map<string, Blob>> {
  const map = new Map<string, Blob>()
  for (const id of state().replacedAssetIds) {
    const blob = await loadOriginal(id)
    if (blob) map.set(id, blob)
  }
  return map
}

/** Checks every photo has a production-quality original; updates the problems list. */
export async function verifyOriginals(): Promise<boolean> {
  const snapshot = state().snapshot
  if (!snapshot) return false
  const report = await checkOriginals(snapshot, await replacementBlobs())
  patch({ imageProblems: report.problems })
  return report.problems.length === 0
}

/** The customer supplies a (better or missing) original for one photo. */
export async function replaceOriginal(assetId: string, file: File): Promise<string | null> {
  const validation = validateImageFile(file)
  if (!validation.ok) return validation.error ?? 'That file can’t be used.'
  if (!(await measureImage(file))) return 'We couldn’t open that photo. Please try another.'
  await saveOriginal(assetId, file)
  const ids = state().replacedAssetIds
  if (!ids.includes(assetId)) patch({ replacedAssetIds: [...ids, assetId] })
  // A different photo means the earlier upload of this asset is stale.
  const { [assetId]: _stale, ...photos } = state().uploads.photos
  patch({ uploads: { ...state().uploads, photos }, problem: null })
  await verifyOriginals()
  return null
}

// ---------------------------------------------------------------- navigation

const ORDER: CheckoutStage[] = ['review', 'details', 'delivery', 'payment', 'confirmation']

export function goToStage(stage: CheckoutStage) {
  patch({ stage, problem: null })
}

export function nextStage() {
  const i = ORDER.indexOf(state().stage)
  if (i < ORDER.length - 1) {
    // Leaving Review is the moment the customer confirms the design.
    if (state().stage === 'review') {
      const s = state().snapshot
      if (s) api.track('design.confirmed', { frames: s.frames.length, totalMinor: s.pricing.totalMinor })
    }
    goToStage(ORDER[i + 1])
  }
}

export function previousStage() {
  const i = ORDER.indexOf(state().stage)
  if (i > 0) goToStage(ORDER[i - 1])
}

export function canLeaveDetails(): boolean {
  return Object.keys(validateCustomerForm(state().customer)).length === 0
}

export function canLeaveDelivery(): boolean {
  return Object.keys(validateDeliveryForm(state().delivery)).length === 0
}

// ---------------------------------------------------------------- pay

function problemFrom(error: unknown): CheckoutProblem {
  if (isApiError(error)) {
    if (error.code === 'NETWORK' || error.code === 'TIMEOUT') return { code: error.code, message: MESSAGES.connection }
    return { code: error.code, message: error.message, details: error.details }
  }
  return { code: 'UNEXPECTED', message: MESSAGES.generic }
}

async function fetchWallBlob(): Promise<Blob | null> {
  const wall = useCompositionStore.getState().wall
  if (!wall) return null
  try {
    return await (await fetch(wall.src)).blob()
  } catch {
    return null
  }
}

/**
 * Upload photos → create the order → open payment. Safe to call again after
 * ANY failure: finished uploads are remembered, and the server treats a
 * repeated order request as the same order.
 */
export async function submitAndPay(): Promise<void> {
  const s = state()
  if (!s.snapshot || !s.idempotencyKey || !s.accessToken || !s.digest) return
  if (['checking', 'uploading', 'creating', 'opening', 'awaiting', 'verifying'].includes(s.phase)) return // already working

  try {
    // 1 · Photos
    patch({ phase: 'checking', problem: null })
    const report = await checkOriginals(s.snapshot, await replacementBlobs())
    patch({ imageProblems: report.problems })
    if (report.problems.length > 0) {
      patch({ phase: 'error', stage: 'review', problem: { code: 'IMAGE_PROBLEMS', message: 'A photo needs attention before we can print your order.', details: report.problems } })
      return
    }

    // 2 · Uploads
    const wallBlob = state().uploads.wall ? null : await fetchWallBlob()
    const previewBlob = state().uploads.preview ? null : await loadOriginal(previewKey(s.digest))
    if ((!state().uploads.wall && !wallBlob) || (!state().uploads.preview && !previewBlob)) {
      patch({ phase: 'error', problem: { code: 'MISSING_LOCAL_IMAGE', message: 'We lost track of your design preview. Please go back to your design and continue to order again.' } })
      return
    }
    const pending = [...report.blobs].filter(([assetId]) => !state().uploads.photos[assetId])
    const total = pending.length + (wallBlob ? 1 : 0) + (previewBlob ? 1 : 0)
    let done = 0
    patch({ phase: 'uploading', uploadProgress: { done, total } })

    const bump = () => patch({ uploadProgress: { done: ++done, total } })
    if (wallBlob) {
      const result = await api.uploadImage(wallBlob)
      patch({ uploads: { ...state().uploads, wall: result.uploadId } })
      bump()
    }
    if (previewBlob) {
      const result = await api.uploadImage(previewBlob)
      patch({ uploads: { ...state().uploads, preview: result.uploadId } })
      bump()
    }
    for (const [assetId, blob] of pending) {
      const result = await api.uploadImage(blob)
      patch({ uploads: { ...state().uploads, photos: { ...state().uploads.photos, [assetId]: result.uploadId } } })
      bump()
    }

    // 3 · The order
    patch({ phase: 'creating' })
    const uploads = state().uploads
    const request: CreateOrderRequest = {
      snapshot: s.snapshot,
      customer: state().customer,
      delivery: state().delivery,
      accessToken: s.accessToken,
      uploads: { wall: uploads.wall!, preview: uploads.preview!, photos: uploads.photos },
    }
    const created = await api.createOrder(request, s.idempotencyKey)
    patch({ order: created.order })

    // 4 · The payment
    await openPayment()
  } catch (error) {
    handleSubmitError(error)
  }
}

function handleSubmitError(error: unknown) {
  const problem = problemFrom(error)
  if (isApiError(error) && error.code === 'IMAGE_PROBLEMS') {
    const details = error.details as { problems?: ReturnType<typeof state>['imageProblems'] } | undefined
    patch({ phase: 'error', stage: 'review', problem, imageProblems: details?.problems ?? state().imageProblems })
    return
  }
  patch({ phase: 'error', problem })
}

/** Opens (or re-opens) the payment for the order that already exists. */
export async function openPayment(): Promise<void> {
  const { order, accessToken } = state()
  if (!order || !accessToken) return
  patch({ phase: 'opening', problem: null })
  try {
    const payment = await api.startPayment(order.publicOrderId, accessToken)
    if (payment.alreadyPaid) {
      await settle(payment.order)
      return
    }
    patch({ order: payment.order })
    if (payment.provider === 'sandbox') {
      patch({ sandboxPayment: payment, phase: 'awaiting' })
    } else {
      await launchRazorpay(payment)
    }
  } catch (error) {
    handleSubmitError(error)
  }
}

async function launchRazorpay(payment: StartedPayment) {
  const payload = payment.clientPayload as { keyId: string; providerOrderId: string; amountMinor: number; currency: string; prefill?: { name?: string; contact?: string } }
  patch({ phase: 'awaiting' })
  try {
    await openRazorpay({
      ...payload,
      onSuccess: (result) => void confirmRazorpay(payment.paymentId, result),
      onFailure: () => void pollUntilSettled(),
      onDismiss: () => void afterDismiss(),
    })
  } catch {
    patch({ phase: 'error', problem: { code: 'PAYMENT_UNAVAILABLE', message: 'We couldn’t open the payment window. Nothing was charged — please try again.' } })
  }
}

async function confirmRazorpay(paymentId: string, result: unknown) {
  const { order, accessToken } = state()
  if (!order || !accessToken) return
  patch({ phase: 'verifying' })
  try {
    await settle(await api.confirmPayment(order.publicOrderId, accessToken, paymentId, result))
  } catch {
    await pollUntilSettled()
  }
}

async function afterDismiss() {
  if (state().phase !== 'awaiting') return
  await pollUntilSettled(1)
}

// ---------------------------------------------------------------- sandbox

/** The test-payment dialog's three buttons. */
export async function resolveSandbox(outcome: 'succeed' | 'fail' | 'cancel'): Promise<void> {
  const payment = state().sandboxPayment
  if (!payment) return
  patch({ sandboxPayment: null, phase: 'verifying' })
  try {
    await api.sandboxResolve(payment.paymentId, outcome)
  } catch {
    /* The click's fate is unknown — the server's answer, below, is what counts. */
  }
  await pollUntilSettled()
}

// ---------------------------------------------------------------- settling

/**
 * Asks the server what happened to the payment — the only thing that ever
 * decides. Checks a few times (webhooks can lag a moment), then, if still
 * unsure, says so plainly rather than guessing.
 */
export async function pollUntilSettled(maxTries = pollDelaysMs.length): Promise<void> {
  const { order, accessToken } = state()
  if (!order || !accessToken) return
  patch({ phase: 'verifying', problem: null })

  for (let i = 0; i < maxTries; i++) {
    let fresh: OrderView
    try {
      fresh = await api.getOrder(order.publicOrderId, accessToken)
    } catch {
      await sleep(pollDelaysMs[Math.min(i, pollDelaysMs.length - 1)])
      continue
    }
    patch({ order: fresh })
    if (fresh.paymentStatus === 'paid') return settle(fresh)
    if (fresh.orderStatus === 'cancelled') return patch({ phase: 'error', problem: { code: 'ORDER_CLOSED', message: 'This order was cancelled. Please start a new order from your design.' } })

    const last = fresh.lastPayment?.status
    if (fresh.paymentStatus === 'failed' || last === 'failed') return patch({ phase: 'failed' })
    if (last === 'cancelled') return patch({ phase: 'cancelled' })
    if (i < maxTries - 1) await sleep(pollDelaysMs[Math.min(i, pollDelaysMs.length - 1)])
  }

  // Ran out of patience without an answer. If a payment attempt is open, the customer
  // may have paid: don't let them assume — and don't let them pay twice.
  patch({ phase: hasOpenPaymentAttempt() ? 'unconfirmed' : 'cancelled', problem: hasOpenPaymentAttempt() ? { code: 'UNCONFIRMED', message: MESSAGES.unconfirmed } : null })
}

function hasOpenPaymentAttempt(): boolean {
  return state().order?.lastPayment?.status === 'created' && state().order?.paymentStatus !== 'paid'
}

/** The order is paid: show the confirmation and let go of the design. */
async function settle(order: OrderView): Promise<void> {
  if (order.paymentStatus !== 'paid') {
    patch({ order })
    return pollUntilSettled()
  }
  patch({ order, phase: 'success', stage: 'confirmation', sandboxPayment: null, problem: null })
  const { accessToken } = state()
  if (accessToken) window.history.replaceState(null, '', `/order/${order.publicOrderId}?t=${accessToken}`)
  // The design has become an order; the draft and the originals are no longer needed.
  await startNewDesign()
}

// ---------------------------------------------------------------- leaving and resuming

/**
 * Back to the design. An order that was created but never paid is cancelled
 * (best effort — the server also refuses to cancel a paid one).
 */
export async function leaveCheckout(): Promise<void> {
  const { order, accessToken, previewUrl } = state()
  if (order && accessToken && order.paymentStatus !== 'paid') {
    try {
      await api.cancelOrder(order.publicOrderId, accessToken)
    } catch {
      /* it stays pending; harmless */
    }
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  clearCheckout()
  state().reset()
  useJourneyStore.getState().goToStep(6)
}

/** After a confirmed order: forget it and return to the start. */
export async function startAnotherDesign(): Promise<void> {
  const { previewUrl } = state()
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  clearCheckout()
  state().reset()
  window.history.replaceState(null, '', '/')
  await discardDraft()
  useCompositionStore.getState().resetComposition()
  useUIStore.getState().resetUI()
  useJourneyStore.getState().resetJourney()
}

/**
 * On page load: pick up a checkout that was in progress. Asks the server what
 * became of any order — a payment may have landed while the tab was closed.
 */
export async function resumeCheckout(): Promise<boolean> {
  const saved = loadCheckout()
  if (!saved) return false

  const preview = await loadOriginal(previewKey(saved.digest))
  patch({
    active: true,
    stage: saved.stage,
    snapshot: saved.snapshot,
    digest: saved.digest,
    previewUrl: preview ? URL.createObjectURL(preview) : null,
    customer: saved.customer,
    delivery: saved.delivery,
    idempotencyKey: saved.idempotencyKey,
    accessToken: saved.accessToken,
    uploads: saved.uploads,
    replacedAssetIds: saved.replacedAssetIds,
    phase: 'idle',
  })
  void loadServerConfig()
  await syncCatalog()

  if (saved.publicOrderId) {
    try {
      const order = await api.getOrder(saved.publicOrderId, saved.accessToken)
      patch({ order })
      if (order.paymentStatus === 'paid') {
        patch({ phase: 'success', stage: 'confirmation' })
      } else if (order.orderStatus === 'cancelled') {
        clearCheckout()
        state().reset()
        return false
      } else {
        patch({ stage: 'payment' })
        // Was a payment in flight when the tab went away? Find out before offering another.
        void pollUntilSettled(order.lastPayment?.status === 'created' ? 3 : 1)
      }
    } catch {
      patch({ stage: 'payment', phase: 'error', problem: { code: 'NETWORK', message: MESSAGES.connection } })
    }
  } else {
    await verifyOriginals()
  }
  return true
}

/** Opens an order from its link (`/order/FRM-…?t=…`), on any device. */
export async function openOrderFromLink(publicOrderId: string, token: string): Promise<boolean> {
  void loadServerConfig()
  try {
    const order = await api.getOrder(publicOrderId, token)
    patch({ active: true, order, accessToken: token, phase: order.paymentStatus === 'paid' ? 'success' : 'idle', stage: order.paymentStatus === 'paid' ? 'confirmation' : 'payment' })
    if (order.paymentStatus !== 'paid') void pollUntilSettled(1)
    return true
  } catch (error) {
    const known = isApiError(error) && (error as ApiError).code === 'NOT_FOUND'
    useUIStore.getState().pushNotice('error', known ? 'We couldn’t find that order. Check the link you were sent.' : MESSAGES.connection)
    window.history.replaceState(null, '', '/')
    return false
  }
}

/** Forces a fresh look at the server's answer ("Check again"). */
export async function checkPaymentAgain(): Promise<void> {
  await pollUntilSettled(3)
}

// ---------------------------------------------------------------- price changed

/**
 * The server says prices moved while the customer was deciding. Fetch the
 * current catalog, rebuild the snapshot from the (unchanged) design at the new
 * prices, and return them to Review to see the new total before paying.
 */
export async function acceptUpdatedPrices(): Promise<boolean> {
  if (!(await syncCatalog())) {
    patch({ phase: 'error', problem: { code: 'NETWORK', message: MESSAGES.connection } })
    return false
  }
  const composition = useCompositionStore.getState()
  const s = state()
  if (!composition.wall || !s.digest) {
    patch({ phase: 'error', problem: { code: 'DESIGN_UNAVAILABLE', message: 'Please go back to your design and continue to order again to see the new prices.' } })
    return false
  }
  if (computeOrderTotals(currentCatalog(), composition.frames).unpricedFrameIds.length > 0) {
    patch({ phase: 'error', problem: { code: 'ITEM_UNAVAILABLE', message: MESSAGES.itemsUnavailable } })
    return false
  }

  const snapshot = buildDesignSnapshot({
    wall: composition.wall,
    wallWidthCm: composition.wallWidthCm,
    placementMode: composition.placementMode,
    wallRegion: composition.wallRegion,
    layoutId: composition.activeLayoutId,
    frames: composition.frames,
    catalog: currentCatalog(),
    now: new Date(),
    appVersion: __APP_VERSION__,
  })
  const digest = await snapshotDigest(snapshot)
  const preview = await loadOriginal(previewKey(s.digest))
  if (preview) await saveOriginal(previewKey(digest), preview)

  // A different price is a different order: new keys, so the server can't confuse the two.
  patch({ snapshot, digest, idempotencyKey: newIdempotencyKey(), phase: 'idle', problem: null, stage: 'review' })
  return true
}
