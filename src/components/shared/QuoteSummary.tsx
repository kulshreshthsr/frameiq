import { useQuote } from '../../hooks/useQuote'
import { formatMoney } from '../../../shared/money'
import styles from './shared.module.css'

/** "Your design" — what's in the order and what it costs, line by line.
 * Identical frames are grouped ("2 × Classic Walnut, 12 × 18 in"). */
export function QuoteSummary() {
  const quote = useQuote()

  if (quote.frameCount === 0) return <p className="hint">Add a frame to see pricing.</p>

  return (
    <div className={styles.quote} data-testid="quote-summary">
      <ul className={styles.quoteLines}>
        {quote.lines.map((line) => (
          <li key={line.key} className={styles.quoteLine}>
            <span className={styles.quoteWhat}>
              <span className={styles.quoteQty}>{line.quantity} ×</span> {line.productName}
              <span className={styles.quoteMeta}>
                {line.sizeLabel}
                {line.optionsLabel ? ` · ${line.optionsLabel}` : ''}
              </span>
            </span>
            <span className={styles.quoteAmount}>{formatMoney(line.lineTotalMinor)}</span>
          </li>
        ))}
      </ul>
      <div className={styles.quoteTotal}>
        <span>Total</span>
        <span data-testid="quote-total">{formatMoney(quote.totalMinor)}</span>
      </div>
    </div>
  )
}
