import { CHECKOUT_STAGES, useCheckoutStore, type CheckoutStage } from './checkoutStore'
import styles from './checkout.module.css'

interface CheckoutHeaderProps {
  /** Return to editing the design (hidden once the order is placed). */
  onBackToDesign: () => void
}

const INDEX: Record<CheckoutStage, number> = { review: 0, details: 1, delivery: 2, payment: 3, confirmation: 4 }

/** The checkout's own progress: where you are, what's done. Deliberately
 * the same visual language as the design steps, so it reads as one journey. */
export function CheckoutHeader({ onBackToDesign }: CheckoutHeaderProps) {
  const stage = useCheckoutStore((s) => s.stage)
  const phase = useCheckoutStore((s) => s.phase)
  const current = INDEX[stage]
  // While a payment might be in flight, leaving would hide its outcome.
  const canLeave = stage !== 'confirmation' && !['uploading', 'creating', 'opening', 'awaiting', 'verifying', 'unconfirmed'].includes(phase)

  return (
    <header className={styles.header}>
      <div className={styles.brand}>Frame Engine</div>
      <nav aria-label="Checkout progress" className={styles.progress}>
        <ol className={styles.progressList}>
          {CHECKOUT_STAGES.map((s, i) => (
            <li key={s.id} className={`${styles.progressItem} ${i === current ? styles.progressCurrent : ''} ${i < current ? styles.progressDone : ''}`} aria-current={i === current ? 'step' : undefined}>
              <span className={styles.progressDot} aria-hidden>
                {i < current ? '✓' : i + 1}
              </span>
              <span className={styles.progressLabel}>{s.label}</span>
              <span className="srOnly">{i < current ? ', completed' : i === current ? ', current step' : ''}</span>
            </li>
          ))}
        </ol>
      </nav>
      <div className={styles.headerAction}>
        {canLeave && (
          <button type="button" className="btnText" onClick={onBackToDesign} data-testid="back-to-design">
            ‹ Edit design
          </button>
        )}
      </div>
    </header>
  )
}
