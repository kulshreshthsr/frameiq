import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderView } from '../../shared/orderSchema'
import { makeSnapshot, resetAllStores } from '../test/fixtures'
import { ConfirmationStage } from './ConfirmationStage'
import { DeliveryStage, DetailsStage } from './FormStages'
import { PaymentStage } from './PaymentStage'
import { ReviewStage } from './ReviewStage'
import { useCheckoutStore } from './checkoutStore'

vi.mock('../order/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../order/api')>()
  return { ...actual, api: { track: vi.fn(), config: vi.fn(), cancelOrder: vi.fn(), startPayment: vi.fn(), getOrder: vi.fn(), uploadImage: vi.fn(), createOrder: vi.fn(), confirmPayment: vi.fn(), sandboxResolve: vi.fn(), catalog: vi.fn() } }
})
vi.mock('../order/catalogSync', () => ({ syncCatalog: vi.fn(async () => true) }))

const store = () => useCheckoutStore.getState()

/** Minimal user actions (the project doesn't carry user-event). */
const user = {
  click: async (el: Element) => void fireEvent.click(el),
  type: async (el: Element, text: string) => void fireEvent.change(el, { target: { value: text } }),
  selectOptions: async (el: Element, value: string) => void fireEvent.change(el, { target: { value } }),
}

const order = (over: Partial<OrderView> = {}): OrderView => ({
  publicOrderId: 'FRM-2026-000042',
  currency: 'INR',
  items: [{ productId: 'walnut', productName: 'Classic Walnut', sizeId: '8x10', sizeLabel: '8 × 10 in', glassName: 'Standard glass', matName: 'No mat', quantity: 2, unitPriceMinor: 49900, lineTotalMinor: 99800 }],
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
} as unknown as OrderView)

beforeEach(() => {
  resetAllStores()
  store().reset()
  store().patch({ active: true, snapshot: makeSnapshot(), digest: 'd'.repeat(64) })
})

describe('Details', () => {
  it('asks in plain words, only after the customer tries to continue', async () => {
    store().patch({ stage: 'details' })
    render(<DetailsStage />)
    expect(screen.queryByText('Please enter your name.')).not.toBeInTheDocument() // not while they haven't tried
    await user.click(screen.getByTestId('details-continue'))
    expect(screen.getByText('Please enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Please enter your mobile number.')).toBeInTheDocument()
    expect(store().stage).toBe('details')
  })

  it('accepts a mobile written the way people write them, and moves on', async () => {
    store().patch({ stage: 'details' })
    render(<DetailsStage />)
    await user.type(screen.getByTestId('field-name'), 'Asha Rao')
    await user.type(screen.getByTestId('field-mobile'), '+91 98765-43210')
    await user.click(screen.getByTestId('details-continue'))
    expect(store().stage).toBe('delivery')
  })

  it('uses the right mobile keyboard and autofill hints', () => {
    render(<DetailsStage />)
    expect(screen.getByTestId('field-mobile')).toHaveAttribute('type', 'tel')
    expect(screen.getByTestId('field-mobile')).toHaveAttribute('autocomplete', 'tel-national')
    expect(screen.getByTestId('field-name')).toHaveAttribute('autocomplete', 'name')
  })

  it('labels each field and links its error for screen readers', async () => {
    render(<DetailsStage />)
    await user.click(screen.getByTestId('details-continue'))
    const name = screen.getByLabelText('Full name')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name.getAttribute('aria-describedby')).toBeTruthy()
  })
})

describe('Delivery', () => {
  it('explains every missing or wrong piece, and does not advance', async () => {
    store().patch({ stage: 'delivery' })
    render(<DeliveryStage />)
    await user.type(screen.getByTestId('field-pin'), '1234')
    await user.click(screen.getByTestId('delivery-continue'))
    expect(screen.getByText('A PIN code is 6 digits, like 560001.')).toBeInTheDocument()
    expect(screen.getByText('Please choose your state.')).toBeInTheDocument()
    expect(store().stage).toBe('delivery')
  })

  it('moves to payment once everything is right', async () => {
    store().patch({ stage: 'delivery' })
    render(<DeliveryStage />)
    await user.type(screen.getByTestId('field-line1'), '12 MG Road')
    await user.type(screen.getByTestId('field-pin'), '560038')
    await user.type(screen.getByTestId('field-city'), 'Bengaluru')
    await user.selectOptions(screen.getByTestId('field-state'), 'Karnataka')
    await user.click(screen.getByTestId('delivery-continue'))
    expect(store().stage).toBe('payment')
  })

  it('offers a numeric keypad for the PIN', () => {
    render(<DeliveryStage />)
    expect(screen.getByTestId('field-pin')).toHaveAttribute('inputmode', 'numeric')
  })
})

describe('Review', () => {
  it('shows every frame with its product and size, and lets a good design be confirmed', () => {
    store().patch({ previewUrl: 'blob:test/preview' })
    render(<ReviewStage onEditDesign={vi.fn()} />)
    expect(screen.getByRole('region', { name: '2 frames' })).toBeInTheDocument()
    expect(screen.getAllByText('Classic Walnut')).toHaveLength(2)
    expect(screen.getAllByText(/8 × 10 in/)).toHaveLength(2)
    expect(screen.getByRole('img', { name: 'Your framed wall' })).toBeInTheDocument()
    expect(screen.getByText(/₹1,147 including delivery/)).toBeInTheDocument()
    expect(screen.getByTestId('confirm-design')).toBeEnabled()
  })

  it('blocks confirmation, and explains, when a photo cannot be printed sharply', () => {
    store().patch({ imageProblems: [{ frameNumber: 1, assetId: 'photo_1', code: 'low_resolution', ppi: 62, requiredPpi: 100 }] })
    render(<ReviewStage onEditDesign={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/too small to print sharply/)
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 100/)
    expect(screen.getByTestId('confirm-design')).toBeDisabled()
  })

  it('lets the customer go back and edit', async () => {
    const onEdit = vi.fn()
    render(<ReviewStage onEditDesign={onEdit} />)
    await user.click(screen.getByRole('button', { name: 'Edit design' }))
    expect(onEdit).toHaveBeenCalled()
  })
})

describe('Payment', () => {
  const fill = () =>
    store().patch({
      stage: 'payment',
      customer: { name: 'Asha Rao', mobile: '9876543210' },
      delivery: { line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560038' },
    })

  it('labels test mode, recaps who and where, and names the exact amount', () => {
    fill()
    store().patch({ serverConfig: { paymentProvider: 'sandbox', sandbox: true, whatsappNumber: null } })
    render(<PaymentStage onEditDesign={vi.fn()} />)
    expect(screen.getByTestId('test-mode')).toHaveTextContent('No real money')
    expect(screen.getByText('Asha Rao · 9876543210')).toBeInTheDocument()
    expect(screen.getByTestId('pay-button')).toHaveTextContent('Pay ₹1,147')
  })

  it('does not claim test mode when the server is not in sandbox', () => {
    fill()
    store().patch({ serverConfig: { paymentProvider: 'razorpay', sandbox: false, whatsappNumber: null } })
    render(<PaymentStage onEditDesign={vi.fn()} />)
    expect(screen.queryByTestId('test-mode')).not.toBeInTheDocument()
  })

  it('a declined payment says nothing was charged and offers to try again', () => {
    fill()
    store().patch({ order: order(), phase: 'failed' })
    render(<PaymentStage onEditDesign={vi.fn()} />)
    expect(screen.getByTestId('payment-failed')).toHaveTextContent('Nothing was charged')
    expect(screen.getByTestId('pay-button')).toHaveTextContent('Try payment again')
  })

  it('a closed window says the customer has not been charged', () => {
    fill()
    store().patch({ order: order(), phase: 'cancelled' })
    render(<PaymentStage onEditDesign={vi.fn()} />)
    expect(screen.getByTestId('payment-cancelled')).toHaveTextContent('haven’t been charged')
  })

  it('when unsure, it says so, shows the order reference, and offers to check again or reopen — never a fresh order', () => {
    fill()
    store().patch({ order: order(), phase: 'unconfirmed', problem: { code: 'UNCONFIRMED', message: 'We haven’t been able to confirm your payment yet.' } })
    render(<PaymentStage onEditDesign={vi.fn()} />)
    const box = screen.getByTestId('unconfirmed')
    expect(box).toHaveTextContent('still confirming your payment')
    expect(within(box).getByText('FRM-2026-000042')).toBeInTheDocument()
    expect(screen.getByTestId('pay-button')).toHaveTextContent('Check again')
    expect(screen.getByTestId('reopen-payment')).toBeInTheDocument()
    expect(screen.queryByText(/^Pay ₹/)).not.toBeInTheDocument()
  })

  it('a price change is explained and offers the new review, not a silent charge', () => {
    fill()
    store().patch({ phase: 'error', problem: { code: 'PRICE_CHANGED', message: 'The price has changed. Nothing was charged.', details: { totalMinor: 134700 } } })
    render(<PaymentStage onEditDesign={vi.fn()} />)
    expect(screen.getByTestId('payment-error')).toHaveAttribute('data-code', 'PRICE_CHANGED')
    expect(screen.getByTestId('pay-button')).toHaveTextContent('Review the new price')
  })

  it('shows progress while uploading, and disables the button so it cannot be double-pressed', () => {
    fill()
    store().patch({ phase: 'uploading', uploadProgress: { done: 1, total: 4 } })
    render(<PaymentStage onEditDesign={vi.fn()} />)
    expect(screen.getByText(/1 of 4/)).toBeInTheDocument()
    expect(screen.getByTestId('pay-button')).toBeDisabled()
  })
})

describe('Confirmation', () => {
  beforeEach(() => {
    store().patch({ order: order({ paymentStatus: 'paid', orderStatus: 'confirmed' }), phase: 'success', stage: 'confirmation', accessToken: 't'.repeat(43), previewUrl: 'blob:test/preview' })
  })

  it('celebrates, and shows the order ID, what was paid, what was bought and where it is going', () => {
    render(<ConfirmationStage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('officially on its way to becoming real')
    expect(screen.getByTestId('order-id')).toHaveTextContent('FRM-2026-000042')
    expect(screen.getByTestId('confirm-total')).toHaveTextContent('₹1,147')
    expect(screen.getByText('Bengaluru, Karnataka 560038')).toBeInTheDocument()
    expect(screen.getByText(/Classic Walnut/)).toBeInTheDocument()
    expect(screen.getByText('What happens next')).toBeInTheDocument()
    expect(screen.getByText(/Thank you, Asha\./)).toBeInTheDocument()
  })

  it('offers WhatsApp only when the business has configured a number', () => {
    const { rerender } = render(<ConfirmationStage />)
    expect(screen.queryByTestId('whatsapp')).not.toBeInTheDocument()
    store().patch({ serverConfig: { paymentProvider: 'sandbox', sandbox: true, whatsappNumber: '919876543210' } })
    rerender(<ConfirmationStage />)
    const link = screen.getByTestId('whatsapp')
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/919876543210\?text=.*FRM-2026-000042/)
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('copies the order ID', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ConfirmationStage />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await screen.findByText('Copied ✓')
    expect(writeText).toHaveBeenCalledWith('FRM-2026-000042')
  })
})
