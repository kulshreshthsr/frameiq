/**
 * Razorpay Checkout in the browser.
 *
 * The browser only ever OPENS the payment and relays Razorpay's signed result
 * to our server, which verifies it. Whether the payment counts is decided
 * there — never here. This file talks to Razorpay's real checkout script, so
 * it is NOT covered by the automated tests (they use the sandbox); it must be
 * tried once in Razorpay's test mode with real test keys before launch.
 */

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

interface RazorpayResult {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      reject(new Error('Razorpay checkout could not be loaded'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export interface RazorpayLaunch {
  keyId: string
  providerOrderId: string
  amountMinor: number
  currency: string
  prefill?: { name?: string; contact?: string }
  onSuccess: (result: RazorpayResult) => void
  onFailure: (reason: string) => void
  onDismiss: () => void
}

export async function openRazorpay(launch: RazorpayLaunch): Promise<void> {
  await loadScript()
  if (!window.Razorpay) throw new Error('Razorpay checkout is unavailable')
  const checkout = new window.Razorpay({
    key: launch.keyId,
    order_id: launch.providerOrderId,
    amount: launch.amountMinor,
    currency: launch.currency,
    name: 'Frame Engine',
    prefill: launch.prefill,
    theme: { color: '#211c17' },
    handler: (result: RazorpayResult) => launch.onSuccess(result),
    modal: { ondismiss: launch.onDismiss },
  })
  checkout.on('payment.failed', (response) => launch.onFailure(response.error?.description ?? 'The payment did not go through.'))
  checkout.open()
}
