import { useQuote } from '../../hooks/useQuote'
import { formatMoney } from '../../../shared/money'
import styles from './shared.module.css'

/** The running total, shown beside the primary action from the moment a
 * layout exists — so what the customer is choosing and what it costs are
 * never on different screens. */
export function PriceTag() {
  const quote = useQuote()
  if (quote.frameCount === 0) return <div className={styles.priceTag} />

  return (
    <div className={styles.priceTag} aria-live="polite" data-testid="price-tag">
      <span className={styles.priceCount}>
        {quote.frameCount} frame{quote.frameCount === 1 ? '' : 's'}
      </span>
      <span className={styles.priceValue} data-testid="price-total">
        {formatMoney(quote.totalMinor)}
      </span>
    </div>
  )
}
