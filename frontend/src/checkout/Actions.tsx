import type { ReactNode } from 'react'
import { useCheckoutTotal } from './useTotals'
import * as cs from './checkoutStyles'

/**
 * The stage's buttons. On a phone this bar sticks to the bottom — total on the
 * left, the one primary action on the right — so the next step is always
 * under the thumb; on desktop it is simply the row below the form.
 */
export function Actions({ children, showTotal = true }: { children: ReactNode; showTotal?: boolean }) {
  const total = useCheckoutTotal()
  return (
    <div className={cs.actions}>
      {showTotal && total && (
        <div className={cs.actionTotal} aria-hidden>
          <span className={cs.actionTotalLabel}>Total</span>
          <span className={cs.actionTotalValue}>{total.text}</span>
        </div>
      )}
      <div className={cs.actionButtons}>{children}</div>
    </div>
  )
}
