import type { ReactNode } from 'react'
import { useCheckoutTotal } from './useTotals'
import styles from './checkout.module.css'

/**
 * The stage's buttons. On a phone this bar sticks to the bottom — total on the
 * left, the one primary action on the right — so the next step is always
 * under the thumb; on desktop it is simply the row below the form.
 */
export function Actions({ children, showTotal = true }: { children: ReactNode; showTotal?: boolean }) {
  const total = useCheckoutTotal()
  return (
    <div className={styles.actions}>
      {showTotal && total && (
        <div className={styles.actionTotal} aria-hidden>
          <span className={styles.actionTotalLabel}>Total</span>
          <span className={styles.actionTotalValue}>{total.text}</span>
        </div>
      )}
      <div className={styles.actionButtons}>{children}</div>
    </div>
  )
}
