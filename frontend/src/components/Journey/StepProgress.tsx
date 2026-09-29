import { STEPS, useJourneyStore } from '../../state/journeyStore'

/**
 * Where the customer is, what they've finished, and a way back to any step
 * they've already reached. Steps ahead of the furthest one reached stay
 * locked — you can revisit, you can't skip.
 *
 * On a phone only the current step keeps its label (the rest collapse to
 * numbered dots), so six steps fit one 390px row without shrinking to
 * unreadable text.
 */
export function StepProgress() {
  const currentStep = useJourneyStore((s) => s.currentStep)
  const furthestStep = useJourneyStore((s) => s.furthestStep)
  const goToStep = useJourneyStore((s) => s.goToStep)

  return (
    <nav aria-label="Progress" className="min-w-0">
      <ol className="m-0 flex list-none items-center justify-center gap-0 p-0">
        {STEPS.map((step) => {
          const isCurrent = step.id === currentStep
          const isDone = step.id < currentStep || (step.id <= furthestStep && !isCurrent)
          const isLocked = step.id > furthestStep
          return (
            <li key={step.id} className="flex items-center">
              <button
                type="button"
                className={`group inline-flex min-h-11 items-center gap-2 border-none bg-none px-1.5 text-[13px] font-semibold tracking-[0.01em] whitespace-nowrap disabled:cursor-default disabled:opacity-55 max-[999px]:min-w-[42px] max-[999px]:justify-center max-[999px]:px-1 ${
                  isCurrent ? 'text-ink' : isDone ? 'text-ink-2' : 'text-ink-3'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
                disabled={isLocked}
                onClick={() => goToStep(step.id)}
                aria-label={`Step ${step.id}: ${step.short}${isDone ? ', completed' : ''}${isLocked ? ', not reached yet' : ''}`}
              >
                <span
                  aria-hidden
                  className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-xs font-bold text-inherit transition-[background-color,border-color,color] duration-150 ease-in-out ${
                    isDone
                      ? 'border-ink bg-ink text-paper'
                      : isCurrent
                        ? 'border-ink bg-paper text-ink shadow-[0_0_0_3px_var(--color-accent-soft)]'
                        : 'border-line-strong group-[:hover:not(:disabled)]:border-ink bg-transparent'
                  }`}
                >
                  {isDone && !isCurrent ? '✓' : step.id}
                </span>
                <span className={isCurrent ? '' : 'max-[999px]:hidden'}>{step.short}</span>
              </button>
              {step.id < STEPS.length && (
                <span aria-hidden className={`h-[1.5px] w-[18px] min-[1000px]:w-7 max-[999px]:hidden ${step.id < furthestStep ? 'bg-ink' : 'bg-line-strong'}`} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
