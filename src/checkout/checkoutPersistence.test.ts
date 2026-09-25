import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSnapshot, resetAllStores } from '../test/fixtures'
import { clearCheckout, loadCheckout, saveCheckout, startCheckoutAutosave } from './checkoutPersistence'
import { useCheckoutStore } from './checkoutStore'
import { hasSavedCheckout } from './savedCheckout'

const KEY = 'framengine.checkout'

function activeCheckout() {
  useCheckoutStore.getState().patch({ active: true, snapshot: makeSnapshot(), digest: 'd'.repeat(64), idempotencyKey: 'idem_abcdefghijklmnopqrstu', accessToken: 't'.repeat(43) })
}

beforeEach(() => {
  resetAllStores()
  localStorage.clear()
  useCheckoutStore.getState().reset()
})
afterEach(() => vi.useRealTimers())

describe('checkout persistence', () => {
  it('saves nothing until checkout is actually under way', () => {
    saveCheckout()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(hasSavedCheckout()).toBe(false)
  })

  it('round-trips the customer’s progress, answers and order reference', () => {
    activeCheckout()
    const s = useCheckoutStore.getState()
    s.patch({ stage: 'delivery' })
    s.setCustomerField('name', 'Asha Rao')
    s.setCustomerField('mobile', '9876543210')
    s.setDeliveryField('city', 'Pune')
    s.patch({ uploads: { wall: 'up_w', preview: 'up_p', photos: { photo_1: 'up_1' } } })
    saveCheckout()

    expect(hasSavedCheckout()).toBe(true)
    const loaded = loadCheckout()!
    expect(loaded).toMatchObject({ stage: 'delivery', digest: 'd'.repeat(64), idempotencyKey: 'idem_abcdefghijklmnopqrstu', publicOrderId: null })
    expect(loaded.customer.name).toBe('Asha Rao')
    expect(loaded.delivery.city).toBe('Pune')
    expect(loaded.uploads).toEqual({ wall: 'up_w', preview: 'up_p', photos: { photo_1: 'up_1' } })
  })

  it('never writes payment or card data', () => {
    activeCheckout()
    saveCheckout()
    expect(localStorage.getItem(KEY)).not.toMatch(/card|cvv|razorpay|signature/i)
  })

  it('discards a corrupted or incompatible save instead of crashing', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadCheckout()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()

    localStorage.setItem(KEY, JSON.stringify({ version: 999, stage: 'payment' }))
    expect(loadCheckout()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('clears on request', () => {
    activeCheckout()
    saveCheckout()
    clearCheckout()
    expect(loadCheckout()).toBeNull()
  })
})

describe('checkout autosave', () => {
  it('debounces typing…', () => {
    vi.useFakeTimers()
    activeCheckout()
    const stop = startCheckoutAutosave()
    useCheckoutStore.getState().setCustomerField('name', 'A')
    useCheckoutStore.getState().setCustomerField('name', 'As')
    expect(loadCheckout()!.customer.name).toBe('')
    vi.advanceTimersByTime(200)
    expect(loadCheckout()!.customer.name).toBe('As')
    stop()
  })

  it('…but writes a stage change or a new order at once, so a refresh cannot lose them', () => {
    vi.useFakeTimers()
    activeCheckout()
    const stop = startCheckoutAutosave()

    useCheckoutStore.getState().patch({ stage: 'payment' })
    expect(loadCheckout()!.stage).toBe('payment') // no timers advanced

    useCheckoutStore.getState().patch({ order: { publicOrderId: 'FRM-2026-000007' } as never })
    expect(loadCheckout()!.publicOrderId).toBe('FRM-2026-000007')
    stop()
  })

  it('flushes anything pending when the page is hidden', () => {
    vi.useFakeTimers()
    activeCheckout()
    const stop = startCheckoutAutosave()
    useCheckoutStore.getState().setDeliveryField('line1', '12 MG Road')
    expect(loadCheckout()!.delivery.line1).toBe('')
    window.dispatchEvent(new Event('pagehide'))
    expect(loadCheckout()!.delivery.line1).toBe('12 MG Road')
    stop()
  })

  it('stops saving once stopped', () => {
    vi.useFakeTimers()
    activeCheckout()
    const stop = startCheckoutAutosave()
    stop()
    useCheckoutStore.getState().patch({ stage: 'payment' })
    vi.advanceTimersByTime(500)
    expect(loadCheckout()!.stage).toBe('review')
  })
})
