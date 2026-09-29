import { formatMoney } from '../../../shared/money'
import { useCheckoutStore } from './checkoutStore'
import { useTotals } from './useTotals'
import * as cs from './checkoutStyles'

/**
 * "What you're buying": the design, each item, and the price. On a phone it
 * folds into a one-line summary at the top so the form stays in reach.
 */
export function OrderSummary() {
  const snapshot = useCheckoutStore((s) => s.snapshot)
  const previewUrl = useCheckoutStore((s) => s.previewUrl)
  const delivery = useCheckoutStore((s) => s.delivery)
  const order = useCheckoutStore((s) => s.order)
  const stage = useCheckoutStore((s) => s.stage)
  const totals = useTotals(snapshot)
  if (!totals) return null

  const frames = snapshot?.frames.length ?? totals.lines.reduce((n, l) => n + l.quantity, 0)
  const showDestination = stage === 'payment' && delivery.city
  const body = (
    <>
      {previewUrl && (
        <img
          className={cs.summaryPreview}
          src={previewUrl}
          alt="Your design on your wall"
          style={snapshot ? { aspectRatio: `${snapshot.wall.asset.width} / ${snapshot.wall.asset.height}` } : undefined}
        />
      )}
      <ul className={cs.summaryLines}>
        {totals.lines.map((line) => (
          <li key={line.key} className={cs.summaryLine}>
            <span>
              <span className={cs.summaryQty}>{line.quantity} ×</span> {line.name}
              <span className={cs.summaryDetail}>{line.detail}</span>
            </span>
            <span className={cs.summaryAmount}>{formatMoney(line.totalMinor, totals.currency)}</span>
          </li>
        ))}
      </ul>
      <dl className="m-0 mt-3">
        <div className={cs.summaryTotalRow}>
          <dt>Frames</dt>
          <dd>{formatMoney(totals.subtotalMinor, totals.currency)}</dd>
        </div>
        <div className={cs.summaryTotalRow}>
          <dt>Delivery</dt>
          <dd>{totals.deliveryFeeMinor === 0 ? 'Free' : formatMoney(totals.deliveryFeeMinor, totals.currency)}</dd>
        </div>
        <div className={cs.summaryGrandRow}>
          <dt className={cs.summaryGrandDt}>Total</dt>
          <dd className={cs.summaryGrandDd} data-testid="checkout-total">
            {formatMoney(totals.totalMinor, totals.currency)}
          </dd>
        </div>
      </dl>
      {showDestination && (
        <p className={cs.summaryDestination}>
          Delivering to {delivery.city}, {delivery.state} {delivery.pin}
        </p>
      )}
      {order && <p className={cs.summaryOrder}>Order {order.publicOrderId}</p>}
    </>
  )

  return (
    <aside className={cs.summary} aria-label="Order summary">
      {/* Phones: collapsed to one line. Desktop: always open (see cs.summaryDesktop). */}
      <details className={cs.summaryDetails}>
        <summary className={cs.summaryToggle}>
          <span className={cs.summaryToggleLabel}>
            Order summary · {frames} frame{frames === 1 ? '' : 's'}
          </span>
          <span className={cs.summaryToggleTotal}>{formatMoney(totals.totalMinor, totals.currency)}</span>
        </summary>
        <div className={cs.summaryBody}>{body}</div>
      </details>
      <div className={cs.summaryDesktop}>
        <h2 className={cs.summaryHeading}>Your order</h2>
        {body}
      </div>
    </aside>
  )
}
