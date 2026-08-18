import { useCompositionStore } from '../../../state/compositionStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { estimatePrice, formatPrice } from '../../../lib/pricing'
import { StepFooterNav } from '../StepFooterNav'
import styles from '../Journey.module.css'

export function Step6Price() {
  const frames = useCompositionStore((s) => s.frames)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const estimate = estimatePrice(frames)

  return (
    <>
      <div className={styles.content}>
        <h2 className={styles.title}>Estimated price</h2>
        <p className={styles.hint}>Based on the frames and styles in your design.</p>

        {estimate.lineItems.length === 0 ? (
          <p className={styles.hint}>Add a frame to see pricing.</p>
        ) : (
          <div className={styles.priceList}>
            {estimate.lineItems.map((item, i) => (
              <div key={item.frameId} className={styles.priceRow}>
                <span className={styles.priceRowMuted}>
                  Frame {i + 1} · {item.styleName}
                </span>
                <span>{formatPrice(item.price)}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Estimated total</span>
          <span className={styles.totalAmount}>{formatPrice(estimate.total)}</span>
        </div>
        <p className={styles.disclaimer}>For illustration only — final pricing may vary by size and finish.</p>
      </div>
      <StepFooterNav onBack={() => goToStep(5)} />
    </>
  )
}
