import { DecorylLogo } from '../components/brand/DecorylLogo'
import { CHECKOUT_STAGES, useCheckoutStore, type CheckoutStage } from './checkoutStore'

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
    <header className="grid min-h-[60px] grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line px-6 max-[999px]:min-h-[52px] max-[999px]:grid-cols-[1fr_auto] max-[999px]:gap-2 max-[999px]:pr-2 max-[999px]:pl-4">
      <div className="max-[999px]:hidden">
        <DecorylLogo size={24} />
      </div>
      <nav aria-label="Checkout progress" className="max-[999px]:order-1 max-[999px]:min-w-0 max-[999px]:justify-self-start">
        <ol className="m-0 flex list-none items-center gap-1 p-0">
          {CHECKOUT_STAGES.map((s, i) => {
            const isCurrent = i === current
            const isDone = i < current
            return (
              <li
                key={s.id}
                className={`inline-flex items-center gap-2 px-2 text-[13px] font-semibold whitespace-nowrap max-[999px]:px-[3px] ${isCurrent || isDone ? 'text-ink' : 'text-ink-3'}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {i > 0 && <span aria-hidden className="mr-2 inline-block h-[1.5px] w-[18px] bg-line-strong align-middle max-[999px]:hidden" />}
                <span
                  aria-hidden
                  className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-xs font-bold ${
                    isDone ? 'border-ink bg-ink text-paper' : isCurrent ? 'border-ink shadow-[0_0_0_3px_var(--color-accent-soft)]' : 'border-line-strong'
                  }`}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span className={isCurrent ? '' : 'max-[999px]:hidden'}>{s.label}</span>
                <span className="sr-only">{isDone ? ', completed' : isCurrent ? ', current step' : ''}</span>
              </li>
            )
          })}
        </ol>
      </nav>
      <div className="justify-self-end max-[999px]:order-2">
        {canLeave && (
          <button type="button" className="btnText" onClick={onBackToDesign} data-testid="back-to-design">
            ‹ Edit design
          </button>
        )}
      </div>
    </header>
  )
}
