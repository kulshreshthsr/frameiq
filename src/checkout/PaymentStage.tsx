import { formatMoney } from '../../shared/money'
import type { ImageProblem } from '../../shared/production'
import { Actions } from './Actions'
import { useCheckoutStore } from './checkoutStore'
import { acceptUpdatedPrices, checkPaymentAgain, leaveCheckout, openPayment, previousStage, submitAndPay } from './flow'
import styles from './checkout.module.css'

const BUSY = ['checking', 'uploading', 'creating', 'opening', 'awaiting', 'verifying']

function Spinner() {
  return <span className={styles.spinner} aria-hidden />
}

/** Says, in plain words, exactly where the order and payment stand. */
function StatusPanel() {
  const phase = useCheckoutStore((s) => s.phase)
  const problem = useCheckoutStore((s) => s.problem)
  const progress = useCheckoutStore((s) => s.uploadProgress)
  const order = useCheckoutStore((s) => s.order)

  switch (phase) {
    case 'checking':
      return <p className={styles.status} role="status"><Spinner /> Checking your photos…</p>
    case 'uploading':
      return (
        <div role="status" className={styles.statusBlock}>
          <p className={styles.status}><Spinner /> Sending your photos for printing… {progress.done} of {progress.total}</p>
          <progress className={styles.progressBar} max={Math.max(progress.total, 1)} value={progress.done} aria-label="Photo upload progress" />
        </div>
      )
    case 'creating':
      return <p className={styles.status} role="status"><Spinner /> Creating your order…</p>
    case 'opening':
      return <p className={styles.status} role="status"><Spinner /> Opening secure payment…</p>
    case 'awaiting':
      return (
        <p className={styles.status} role="status">
          <Spinner /> Waiting for your payment. Complete it in the payment window — you haven’t been charged yet.
        </p>
      )
    case 'verifying':
      return (
        <div className={styles.statusBlock} role="status">
          <p className={styles.status}><Spinner /> Confirming your payment…</p>
          <p className={styles.softNote}>Please keep this page open and don’t pay again.</p>
        </div>
      )
    case 'unconfirmed':
      return (
        <div className={`${styles.callout} ${styles.calloutWarn}`} role="alert" data-testid="unconfirmed">
          <p className={styles.calloutTitle}>We’re still confirming your payment</p>
          <p>{problem?.message}</p>
          {order && <p className={styles.softNote}>Your order reference is <strong>{order.publicOrderId}</strong>.</p>}
          <p className={styles.softNote}>Closed the payment window before finishing? Reopening it continues the same payment — you can’t be charged twice for this order.</p>
        </div>
      )
    case 'failed':
      return (
        <div className={`${styles.callout} ${styles.calloutWarn}`} role="alert" data-testid="payment-failed">
          <p className={styles.calloutTitle}>That payment didn’t go through</p>
          <p>Nothing was charged. Your order is saved — you can try again, with the same or a different method.</p>
        </div>
      )
    case 'cancelled':
      return (
        <div className={styles.callout} role="status" data-testid="payment-cancelled">
          <p className={styles.calloutTitle}>Payment cancelled</p>
          <p>You haven’t been charged. Your order is saved whenever you’re ready to pay. If you did complete a payment just now, it may take a moment to show — check again before paying twice.</p>
        </div>
      )
    case 'error':
      return <ErrorPanel />
    default:
      return null
  }
}

function describeImageProblems(problems: ImageProblem[]): string {
  return problems.map((p) => `Frame ${p.frameNumber}`).join(', ')
}

function ErrorPanel() {
  const problem = useCheckoutStore((s) => s.problem)
  if (!problem) return null
  const details = problem.details as { serverTotals?: { totalMinor: number; currency: string }; problems?: ImageProblem[]; frameNumbers?: number[] } | undefined

  return (
    <div className={`${styles.callout} ${styles.calloutWarn}`} role="alert" data-testid="payment-error" data-code={problem.code}>
      <p className={styles.calloutTitle}>
        {problem.code === 'PRICE_CHANGED' ? 'The price has changed' : problem.code === 'IMAGE_PROBLEMS' ? 'A photo needs attention' : 'We couldn’t place your order'}
      </p>
      <p>{problem.message}</p>
      {problem.code === 'PRICE_CHANGED' && details?.serverTotals && (
        <p>New total: <strong>{formatMoney(details.serverTotals.totalMinor, details.serverTotals.currency)}</strong></p>
      )}
      {problem.code === 'IMAGE_PROBLEMS' && details?.problems && <p className={styles.softNote}>{describeImageProblems(details.problems)}</p>}
      <p className={styles.softNote}>Nothing was charged.</p>
    </div>
  )
}

export function PaymentStage({ onEditDesign }: { onEditDesign: () => void }) {
  const phase = useCheckoutStore((s) => s.phase)
  const problem = useCheckoutStore((s) => s.problem)
  const customer = useCheckoutStore((s) => s.customer)
  const delivery = useCheckoutStore((s) => s.delivery)
  const snapshot = useCheckoutStore((s) => s.snapshot)
  const order = useCheckoutStore((s) => s.order)
  const serverConfig = useCheckoutStore((s) => s.serverConfig)
  const goToStage = useCheckoutStore((s) => s.patch)

  const totalMinor = order?.totalMinor ?? snapshot?.pricing.totalMinor ?? 0
  const currency = order?.currency ?? snapshot?.pricing.currency ?? 'INR'
  const busy = BUSY.includes(phase)

  // What the primary button does depends on what is safe to do next.
  const code = problem?.code
  let primary: { label: string; run: () => void; disabled?: boolean } | null = null
  if (phase === 'unconfirmed') primary = { label: 'Check again', run: () => void checkPaymentAgain() }
  else if (phase === 'error' && code === 'PRICE_CHANGED') primary = { label: 'Review the new price', run: () => void acceptUpdatedPrices() }
  else if (phase === 'error' && (code === 'ITEM_UNAVAILABLE' || code === 'MISSING_LOCAL_IMAGE' || code === 'DESIGN_UNAVAILABLE' || code === 'ORDER_CLOSED')) primary = { label: 'Edit design', run: () => void onEditDesign() }
  else if (phase === 'error' && code === 'IMAGE_PROBLEMS') primary = { label: 'Fix the photo', run: () => goToStage({ stage: 'review', phase: 'idle', problem: null }) }
  else if (order && (phase === 'failed' || phase === 'cancelled')) primary = { label: `Try payment again`, run: () => void openPayment() }
  else primary = { label: phase === 'error' ? 'Try again' : `Pay ${formatMoney(totalMinor, currency)}`, run: () => void (order && phase === 'error' && code !== 'NETWORK' ? openPayment() : submitAndPay()), disabled: busy }

  return (
    <div className={styles.stage}>
      <h1 className={styles.stageTitle}>Payment</h1>
      <p className={styles.stageLead}>One last look, then pay securely.</p>

      {serverConfig?.sandbox && (
        <p className={styles.testBanner} role="note" data-testid="test-mode">
          <strong>Test mode.</strong> No real money is charged in this version.
        </p>
      )}

      <dl className={styles.recap}>
        <div>
          <dt>Contact</dt>
          <dd>{customer.name} · {customer.mobile}</dd>
        </div>
        <div>
          <dt>Deliver to</dt>
          <dd>
            {delivery.line1}
            {delivery.line2 ? `, ${delivery.line2}` : ''}
            <br />
            {delivery.city}, {delivery.state} {delivery.pin}
          </dd>
        </div>
      </dl>

      <StatusPanel />

      <Actions>
        {phase === 'unconfirmed' && (
          <button type="button" className="btn btnSecondary" onClick={() => void openPayment()} data-testid="reopen-payment">
            Reopen payment window
          </button>
        )}
        {phase !== 'unconfirmed' && !busy && !order && (
          <button type="button" className="btn btnSecondary" onClick={previousStage}>
            Back
          </button>
        )}
        {primary && (
          <button type="button" className="btn btnPrimary" onClick={primary.run} disabled={primary.disabled} data-testid="pay-button">
            {primary.label}
          </button>
        )}
      </Actions>

      {!busy && phase !== 'unconfirmed' && (
        <p className={styles.softNote}>
          You’ll only be charged after you confirm the payment. Card and UPI details go straight to our payment partner — we never see or store them.
        </p>
      )}
      {order && phase !== 'unconfirmed' && !busy && (
        <p className={styles.softNote}>
          <button type="button" className="btnText" onClick={() => void leaveCheckout()}>
            Cancel this order and edit my design
          </button>
        </p>
      )}
    </div>
  )
}
