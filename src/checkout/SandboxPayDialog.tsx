import { formatMoney } from '../../shared/money'
import { Dialog } from '../components/shared/Dialog'
import { useCheckoutStore } from './checkoutStore'
import { resolveSandbox } from './flow'
import styles from './checkout.module.css'

/**
 * A stand-in for the payment provider's own page, shown ONLY when the server
 * is running its sandbox provider (development and tests). It lets the whole
 * flow — success, decline, cancel — be exercised without any real money.
 * It is not part of a production build's behaviour: a production server has
 * no sandbox provider, so this dialog never opens.
 */
export function SandboxPayDialog() {
  const payment = useCheckoutStore((s) => s.sandboxPayment)
  return (
    <Dialog open={Boolean(payment)} title="Test payment" onClose={() => void resolveSandbox('cancel')}>
      {payment && (
        <div className={styles.sandbox}>
          <p className={styles.sandboxBadge}>Test payment</p>
          <h2 className={styles.sandboxTitle}>Pay {formatMoney(payment.amountMinor, payment.currency)}</h2>
          <p className={styles.sandboxText}>This is a simulated payment page. No card is used and no money moves. Choose what should happen:</p>
          <div className={styles.sandboxActions}>
            <button type="button" className="btn btnPrimary btnBlock" onClick={() => void resolveSandbox('succeed')} data-testid="sandbox-succeed">
              Pay successfully
            </button>
            <button type="button" className="btn btnSecondary btnBlock" onClick={() => void resolveSandbox('fail')} data-testid="sandbox-fail">
              Simulate a decline
            </button>
            <button type="button" className="btnText" onClick={() => void resolveSandbox('cancel')} data-testid="sandbox-cancel">
              Cancel payment
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
