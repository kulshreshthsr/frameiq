import { STEPS, useJourneyStore } from '../../state/journeyStore'
import styles from './StepProgress.module.css'

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
    <nav aria-label="Progress" className={styles.nav}>
      <ol className={styles.list}>
        {STEPS.map((step) => {
          const isCurrent = step.id === currentStep
          const isDone = step.id < currentStep || (step.id <= furthestStep && !isCurrent)
          const isLocked = step.id > furthestStep
          return (
            <li key={step.id} className={styles.item}>
              <button
                type="button"
                className={`${styles.step} ${isCurrent ? styles.current : ''} ${isDone ? styles.done : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
                disabled={isLocked}
                onClick={() => goToStep(step.id)}
                aria-label={`Step ${step.id}: ${step.short}${isDone ? ', completed' : ''}${isLocked ? ', not reached yet' : ''}`}
              >
                <span className={styles.dot} aria-hidden>
                  {isDone && !isCurrent ? '✓' : step.id}
                </span>
                <span className={styles.label}>{step.short}</span>
              </button>
              {step.id < STEPS.length && <span className={`${styles.rule} ${step.id < furthestStep ? styles.ruleDone : ''}`} aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
