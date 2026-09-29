import { useQuote } from '../../hooks/useQuote'
import { formatMoney } from '../../../../shared/money'

/** The running total, shown beside the primary action from the moment a
 * layout exists — so what the customer is choosing and what it costs are
 * never on different screens. */
export function PriceTag() {
  const quote = useQuote()
  if (quote.frameCount === 0) return <div className="flex min-w-0 flex-col justify-center leading-[1.15]" />

  return (
    <div className="flex min-w-0 flex-col justify-center leading-[1.15]" aria-live="polite" data-testid="price-tag">
      <span className="text-ink-3 text-xs font-semibold tracking-[0.02em]">
        {quote.frameCount} frame{quote.frameCount === 1 ? '' : 's'}
      </span>
      <span className="font-serif text-[26px] font-semibold tracking-[-0.01em] text-ink [font-variant-numeric:lining-nums_tabular-nums]" data-testid="price-total">
        {formatMoney(quote.totalMinor)}
      </span>
    </div>
  )
}
