import { formatMoney } from '../../shared/money'
import { useCheckoutStore } from './checkoutStore'
import { useTotals } from './useTotals'
import styles from './checkout.module.css'

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
          className={styles.summaryPreview}
          src={previewUrl}
          alt="Your design on your wall"
          style={snapshot ? { aspectRatio: `${snapshot.wall.asset.width} / ${snapshot.wall.asset.height}` } : undefined}
        />
      )}
      <ul className={styles.summaryLines}>
        {totals.lines.map((line) => (
          <li key={line.key} className={styles.summaryLine}>
            <span>
              <span className={styles.summaryQty}>{line.quantity} ×</span> {line.name}
              <span className={styles.summaryDetail}>{line.detail}</span>
            </span>
            <span className={styles.summaryAmount}>{formatMoney(line.totalMinor, totals.currency)}</span>
          </li>
        ))}
      </ul>
      <dl className={styles.summaryTotals}>
        <div>
          <dt>Frames</dt>
          <dd>{formatMoney(totals.subtotalMinor, totals.currency)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{totals.deliveryFeeMinor === 0 ? 'Free' : formatMoney(totals.deliveryFeeMinor, totals.currency)}</dd>
        </div>
        <div className={styles.summaryGrand}>
          <dt>Total</dt>
          <dd data-testid="checkout-total">{formatMoney(totals.totalMinor, totals.currency)}</dd>
        </div>
      </dl>
      {showDestination && (
        <p className={styles.summaryDestination}>
          Delivering to {delivery.city}, {delivery.state} {delivery.pin}
        </p>
      )}
      {order && <p className={styles.summaryOrder}>Order {order.publicOrderId}</p>}
    </>
  )

  return (
    <aside className={styles.summary} aria-label="Order summary">
      {/* Phones: collapsed to one line. Desktop: always open (see CSS). */}
      <details className={styles.summaryDetails}>
        <summary className={styles.summaryToggle}>
          <span>Order summary · {frames} frame{frames === 1 ? '' : 's'}</span>
          <span className={styles.summaryToggleTotal}>{formatMoney(totals.totalMinor, totals.currency)}</span>
        </summary>
        <div className={styles.summaryBody}>{body}</div>
      </details>
      <div className={styles.summaryDesktop}>
        <h2 className={styles.summaryHeading}>Your order</h2>
        {body}
      </div>
    </aside>
  )
}
