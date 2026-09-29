import { useQuote } from '../../hooks/useQuote'
import { formatMoney } from '../../../../shared/money'

/** "Your design" — what's in the order and what it costs, line by line.
 * Identical frames are grouped ("2 × Classic Walnut, 12 × 18 in"). */
export function QuoteSummary() {
  const quote = useQuote()

  if (quote.frameCount === 0) return <p className="hint">Add a frame to see pricing.</p>

  return (
    <div className="border-line w-full rounded-card border bg-white" data-testid="quote-summary">
      <ul className="m-0 list-none px-4 py-1">
        {quote.lines.map((line) => (
          <li key={line.key} className="border-line flex items-start justify-between gap-3 border-b py-3 text-[14.5px] font-semibold last:border-b-0">
            <span className="flex min-w-0 flex-col">
              <span className="text-ink-3 font-semibold">{line.quantity} ×</span> {line.productName}
              <span className="text-ink-3 text-[13px] font-medium">
                {line.sizeLabel}
                {line.optionsLabel ? ` · ${line.optionsLabel}` : ''}
              </span>
            </span>
            <span className="flex-none [font-variant-numeric:tabular-nums]">{formatMoney(line.lineTotalMinor)}</span>
          </li>
        ))}
      </ul>
      <div className="border-line-strong flex items-baseline justify-between border-t px-4 py-3.5 text-[13px] font-bold tracking-[0.06em] uppercase">
        <span>Total</span>
        <span data-testid="quote-total" className="font-serif text-2xl font-semibold tracking-[-0.01em] normal-case [font-variant-numeric:lining-nums_tabular-nums]">
          {formatMoney(quote.totalMinor)}
        </span>
      </div>
    </div>
  )
}
