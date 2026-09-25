import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderView } from '../../shared/orderSchema'
import { ApiError } from '../order/api'
import { clearOriginals, saveOriginal } from '../order/originals'
import { useCompositionStore } from '../state/compositionStore'
import { designTwoWalnutFrames, resetAllStores } from '../test/fixtures'
import { useUIStore } from '../state/uiStore'
import { loadCheckout, saveCheckout } from './checkoutPersistence'
import { useCheckoutStore } from './checkoutStore'
import { beginCheckout, leaveCheckout, openOrderFromLink, resolveSandbox, resumeCheckout, setPollDelaysForTests, submitAndPay, verifyOriginals, nextStage, previousStage } from './flow'

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  uploadImage: vi.fn(),
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  cancelOrder: vi.fn(),
  startPayment: vi.fn(),
  confirmPayment: vi.fn(),
  sandboxResolve: vi.fn(),
  track: vi.fn(),
  syncCatalog: vi.fn(),
}))

vi.mock('../order/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../order/api')>()
  return { ...actual, api: { ...mocks, catalog: vi.fn() } }
})
vi.mock('../order/catalogSync', () => ({ syncCatalog: mocks.syncCatalog }))

const store = () => useCheckoutStore.getState()
const png = () => new Blob(['preview'], { type: 'image/png' })

function orderView(over: Partial<OrderView> = {}): OrderView {
  return {
    publicOrderId: 'FRM-2026-000001',
    currency: 'INR',
    items: [],
    subtotalMinor: 99800,
    deliveryFeeMinor: 14900,
    totalMinor: 114700,
    paymentStatus: 'pending',
    orderStatus: 'awaiting_payment',
    customerName: 'Asha Rao',
    deliveryCity: 'Bengaluru',
    deliveryState: 'Karnataka',
    deliveryPin: '560038',
    createdAt: '2026-09-26T10:00:00.000Z',
    paidAt: null,
    lastPayment: null,
    ...over,
  } as OrderView
}

const sandboxPayment = () => ({ paymentId: 'pay_1', provider: 'sandbox', amountMinor: 114700, currency: 'INR', clientPayload: {}, alreadyPaid: false, order: orderView() })

/** A designed wall whose photos have their originals on hand, ready for "Continue to order". */
async function designAndBegin() {
  designTwoWalnutFrames()
  for (const frame of useCompositionStore.getState().frames) await saveOriginal(frame.photo!.assetId, new Blob(['original'], { type: 'image/jpeg' }))
  const result = await beginCheckout(async () => png())
  expect(result).toEqual({ ok: true })
}

async function fillAndReachPayment() {
  store().patch({ customer: { name: 'Asha Rao', mobile: '9876543210' }, delivery: { line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560038' }, stage: 'payment' })
}

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  resetAllStores()
  store().reset()
  await clearOriginals()
  setPollDelaysForTests([1, 1, 1])
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['wall'], { type: 'image/jpeg' }) })))
  mocks.syncCatalog.mockResolvedValue(true)
  mocks.config.mockResolvedValue({ paymentProvider: 'sandbox', sandbox: true, whatsappNumber: null })
  let uploads = 0
  mocks.uploadImage.mockImplementation(async () => ({ uploadId: `up_${++uploads}`, width: 1600, height: 1200, bytes: 10, mime: 'image/jpeg' }))
  mocks.createOrder.mockResolvedValue({ order: orderView(), replayed: false, digest: 'x' })
  mocks.startPayment.mockResolvedValue(sandboxPayment())
  mocks.getOrder.mockResolvedValue(orderView())
  mocks.sandboxResolve.mockResolvedValue({ outcome: 'ok' })
  mocks.cancelOrder.mockResolvedValue(orderView({ orderStatus: 'cancelled' }))
})

describe('beginCheckout', () => {
  it('freezes the design and opens Review', async () => {
    await designAndBegin()
    expect(store()).toMatchObject({ active: true, stage: 'review' })
    expect(store().snapshot!.frames).toHaveLength(2)
    expect(store().snapshot!.pricing.totalMinor).toBe(114700)
    expect(store().digest).toMatch(/^[0-9a-f]{64}$/)
    expect(store().accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(store().idempotencyKey).toMatch(/^idem_/)
    expect(mocks.track).toHaveBeenCalledWith('checkout.started', { frames: 2, totalMinor: 114700 })
  })

  it('the frozen design does not move when the editor design changes afterwards', async () => {
    await designAndBegin()
    const frozen = JSON.stringify(store().snapshot)
    useCompositionStore.getState().configureFrames('all', { sizeId: '12x18' })
    expect(JSON.stringify(store().snapshot)).toBe(frozen)
  })

  it('explains, calmly, when the ordering system can’t be reached — and does not open checkout', async () => {
    designTwoWalnutFrames()
    mocks.syncCatalog.mockResolvedValue(false)
    const result = await beginCheckout(async () => png())
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('can’t reach our ordering system') })
    expect(store().active).toBe(false)
  })

  it('explains when the preview can’t be rendered', async () => {
    designTwoWalnutFrames()
    const result = await beginCheckout(async () => {
      throw new Error('canvas tainted')
    })
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('preview') })
    expect(store().active).toBe(false)
  })

  it('will not order an empty wall', async () => {
    designTwoWalnutFrames()
    for (const frame of [...useCompositionStore.getState().frames]) useCompositionStore.getState().removeFrame(frame.id)
    const result = await beginCheckout(async () => png())
    expect(result.ok).toBe(false)
  })

  it('flags a photo whose production original has gone missing — never quietly using the editing copy', async () => {
    designTwoWalnutFrames()
    // (no originals saved)
    await beginCheckout(async () => png())
    expect(store().imageProblems).toHaveLength(2)
    expect(store().imageProblems[0].code).toBe('missing')
  })

  it('flags a photo too small to print at the chosen size', async () => {
    designTwoWalnutFrames()
    useCompositionStore.getState().configureFrames('all', { sizeId: '24x36' })
    for (const frame of useCompositionStore.getState().frames) await saveOriginal(frame.photo!.assetId, new Blob(['x'], { type: 'image/jpeg' }))
    await beginCheckout(async () => png())
    expect(store().imageProblems.map((p) => p.code)).toEqual(['low_resolution', 'low_resolution'])
    expect(await verifyOriginals()).toBe(false)
  })
})

describe('navigation', () => {
  it('moves forward and back, and confirming the design is tracked', async () => {
    await designAndBegin()
    nextStage()
    expect(store().stage).toBe('details')
    expect(mocks.track).toHaveBeenCalledWith('design.confirmed', { frames: 2, totalMinor: 114700 })
    nextStage()
    expect(store().stage).toBe('delivery')
    previousStage()
    expect(store().stage).toBe('details')
  })
})

describe('submitAndPay', () => {
  it('uploads once, creates ONE order with its idempotency key, and opens the payment', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    await submitAndPay()

    expect(mocks.uploadImage).toHaveBeenCalledTimes(4) // wall + preview + 2 photos
    expect(mocks.createOrder).toHaveBeenCalledTimes(1)
    const [request, key] = mocks.createOrder.mock.calls[0]
    expect(key).toBe(store().idempotencyKey)
    expect(request.accessToken).toBe(store().accessToken)
    expect(request.uploads.photos).toBeTruthy()
    expect(Object.keys(request.uploads.photos)).toHaveLength(2)
    expect(request.customer.mobile).toBe('9876543210')
    expect(mocks.startPayment).toHaveBeenCalledTimes(1)
    expect(store().phase).toBe('awaiting')
    expect(store().sandboxPayment?.paymentId).toBe('pay_1')
  })

  it('ignores a second press while the first is still working', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    await Promise.all([submitAndPay(), submitAndPay(), submitAndPay()])
    expect(mocks.createOrder).toHaveBeenCalledTimes(1)
    expect(mocks.startPayment).toHaveBeenCalledTimes(1)
  })

  it('after a failure, "try again" reuses finished uploads and the same idempotency key', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    mocks.createOrder.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'offline'))
    await submitAndPay()
    expect(store().phase).toBe('error')
    expect(store().problem?.message).toContain('nothing was charged')
    const key = store().idempotencyKey

    await submitAndPay()
    expect(mocks.uploadImage).toHaveBeenCalledTimes(4) // not 8
    expect(mocks.createOrder).toHaveBeenCalledTimes(2)
    expect(mocks.createOrder.mock.calls[1][1]).toBe(key)
    expect(store().phase).toBe('awaiting')
  })

  it('stops at Review, with reasons, when a photo can’t be printed — and creates no order', async () => {
    designTwoWalnutFrames() // no originals stored
    await beginCheckout(async () => png())
    await fillAndReachPayment()
    await submitAndPay()
    expect(mocks.createOrder).not.toHaveBeenCalled()
    expect(store()).toMatchObject({ stage: 'review', phase: 'error', problem: expect.objectContaining({ code: 'IMAGE_PROBLEMS' }) })
  })

  it('surfaces a price change, with the server’s message, rather than charging the old price', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    mocks.createOrder.mockRejectedValueOnce(new ApiError('PRICE_CHANGED', 409, 'The price has changed.', { totalMinor: 134700 }))
    await submitAndPay()
    expect(store().phase).toBe('error')
    expect(store().problem).toMatchObject({ code: 'PRICE_CHANGED', details: { totalMinor: 134700 } })
    expect(mocks.startPayment).not.toHaveBeenCalled()
  })

  it('does nothing if there is no frozen design', async () => {
    await submitAndPay()
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })
})

describe('after the payment window', () => {
  async function awaitingPayment() {
    await designAndBegin()
    await fillAndReachPayment()
    await submitAndPay()
  }

  it('confirmation comes only from the server saying "paid" — then the design is let go', async () => {
    await awaitingPayment()
    mocks.getOrder.mockResolvedValue(orderView({ paymentStatus: 'paid', orderStatus: 'confirmed', paidAt: '2026-09-26T10:05:00.000Z' }))
    await resolveSandbox('succeed')

    expect(mocks.sandboxResolve).toHaveBeenCalledWith('pay_1', 'succeed')
    expect(store()).toMatchObject({ phase: 'success', stage: 'confirmation' })
    expect(window.location.pathname).toBe('/order/FRM-2026-000001')
    expect(window.location.search).toBe(`?t=${store().accessToken}`)
    expect(useCompositionStore.getState().frames).toHaveLength(0) // the finished design is cleared
  })

  it('a decline is reported as failed, and offers a retry', async () => {
    await awaitingPayment()
    mocks.getOrder.mockResolvedValue(orderView({ paymentStatus: 'failed', lastPayment: { status: 'failed', failureReason: 'declined' } }))
    await resolveSandbox('fail')
    expect(store().phase).toBe('failed')
    expect(store().stage).toBe('payment')
  })

  it('closing the payment window is reported as cancelled', async () => {
    await awaitingPayment()
    mocks.getOrder.mockResolvedValue(orderView({ lastPayment: { status: 'cancelled', failureReason: null } }))
    await resolveSandbox('cancel')
    expect(store().phase).toBe('cancelled')
  })

  it('does not believe the browser: if the server can’t confirm, it says so and warns not to pay twice', async () => {
    await awaitingPayment()
    // The click "worked", but the server still sees an open, unpaid payment.
    mocks.getOrder.mockResolvedValue(orderView({ lastPayment: { status: 'created', failureReason: null } }))
    await resolveSandbox('succeed')
    expect(store().phase).toBe('unconfirmed')
    expect(store().problem?.message).toContain('confirm your payment')
    expect(store().stage).toBe('payment')
  })

  it('still asks the server if the click itself failed to arrive', async () => {
    await awaitingPayment()
    mocks.sandboxResolve.mockRejectedValue(new ApiError('NETWORK', 0, 'offline'))
    mocks.getOrder.mockResolvedValue(orderView({ paymentStatus: 'paid', orderStatus: 'confirmed' })) // e.g. the webhook landed
    await resolveSandbox('succeed')
    expect(store().phase).toBe('success')
  })

  it('an already-paid order (a repeated request) goes straight to confirmation, never a second payment', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    mocks.startPayment.mockResolvedValue({ ...sandboxPayment(), alreadyPaid: true, order: orderView({ paymentStatus: 'paid', orderStatus: 'confirmed' }) })
    await submitAndPay()
    expect(store().phase).toBe('success')
    expect(store().sandboxPayment).toBeNull()
  })
})

describe('leaving, resuming and order links', () => {
  it('leaving with an unpaid order cancels it and returns to the design', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    await submitAndPay()
    await leaveCheckout()
    expect(mocks.cancelOrder).toHaveBeenCalledWith('FRM-2026-000001', store().accessToken ?? expect.anything())
    expect(store().active).toBe(false)
    expect(loadCheckout()).toBeNull()
  })

  it('leaving before any order exists just returns to the design', async () => {
    await designAndBegin()
    await leaveCheckout()
    expect(mocks.cancelOrder).not.toHaveBeenCalled()
    expect(store().active).toBe(false)
  })

  it('resumes a saved checkout, and finds out from the server that a payment landed while away', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    await submitAndPay()
    saveCheckout()

    store().reset() // a fresh page load
    mocks.getOrder.mockResolvedValue(orderView({ paymentStatus: 'paid', orderStatus: 'confirmed' }))
    expect(await resumeCheckout()).toBe(true)
    expect(store()).toMatchObject({ phase: 'success', stage: 'confirmation', active: true })
    expect(store().customer.name).toBe('Asha Rao')
  })

  it('resumes into Payment for an unpaid order, and never offers a stale “paid”', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    await submitAndPay()
    saveCheckout()
    store().reset()
    mocks.getOrder.mockResolvedValue(orderView())
    await resumeCheckout()
    expect(store().stage).toBe('payment')
    expect(store().phase).not.toBe('success')
  })

  it('an order cancelled elsewhere is not resumed', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    await submitAndPay()
    saveCheckout()
    store().reset()
    mocks.getOrder.mockResolvedValue(orderView({ orderStatus: 'cancelled' }))
    expect(await resumeCheckout()).toBe(false)
    expect(loadCheckout()).toBeNull()
  })

  it('a connection failure while resuming lands on Payment with a calm message, not a crash', async () => {
    await designAndBegin()
    await fillAndReachPayment()
    await submitAndPay()
    saveCheckout()
    store().reset()
    mocks.getOrder.mockRejectedValue(new ApiError('NETWORK', 0, 'offline'))
    expect(await resumeCheckout()).toBe(true)
    expect(store()).toMatchObject({ stage: 'payment', phase: 'error' })
  })

  it('has nothing to resume when nothing was saved', async () => {
    expect(await resumeCheckout()).toBe(false)
  })

  it('opens an order from its private link on any device', async () => {
    mocks.getOrder.mockResolvedValue(orderView({ paymentStatus: 'paid', orderStatus: 'confirmed' }))
    expect(await openOrderFromLink('FRM-2026-000001', 'tok')).toBe(true)
    expect(mocks.getOrder).toHaveBeenCalledWith('FRM-2026-000001', 'tok')
    expect(store()).toMatchObject({ active: true, phase: 'success', stage: 'confirmation' })
  })

  it('a wrong or unknown link is explained kindly and leaves no half-open checkout', async () => {
    mocks.getOrder.mockRejectedValue(new ApiError('NOT_FOUND', 404, 'nope'))
    expect(await openOrderFromLink('FRM-2026-000001', 'wrong')).toBe(false)
    expect(store().active).toBe(false)
    expect(useUIStore.getState().notices.some((n) => n.message.includes('couldn’t find that order'))).toBe(true)
    expect(window.location.pathname).toBe('/')
  })
})
