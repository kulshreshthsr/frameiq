import { STEPS, useJourneyStore } from '../../state/journeyStore'
import styles from './StepProgress.module.css'

/** Six-step progress indicator. Completed steps are clickable (jump back to
 * revisit a choice); future steps stay visible but inert until reached. */
export function StepProgress() {
  const currentStep = useJourneyStore((s) => s.currentStep)
  const furthestStep = useJourneyStore((s) => s.furthestStep)
  const goToStep = useJourneyStore((s) => s.goToStep)

  return (
    <ol className={styles.list} aria-label="Design steps">
      {STEPS.map((step, i) => {
        const isActive = step.id === currentStep
        const isDone = step.id < currentStep
        const isReachable = step.id <= furthestStep

        return (
          <li key={step.id} className={styles.item}>
            {i > 0 && <span className={`${styles.connector} ${isDone || isActive ? styles.connectorDone : ''}`} />}
            <button
              type="button"
              className={`${styles.stepButton} ${isActive ? styles.active : ''} ${isDone ? styles.done : ''}`}
              onClick={() => goToStep(step.id)}
              disabled={!isReachable}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className={styles.bubble}>{isDone ? '✓' : step.id}</span>
              <span className={styles.label}>{step.short}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
