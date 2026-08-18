import toolbarStyles from '../Toolbar/Toolbar.module.css'
import styles from './Journey.module.css'

interface StepFooterNavProps {
  onBack?: () => void
  onContinue?: () => void
  continueLabel?: string
}

export function StepFooterNav({ onBack, onContinue, continueLabel = 'Continue' }: StepFooterNavProps) {
  return (
    <div className={styles.footerNav}>
      {onBack && (
        <button type="button" className={`${toolbarStyles.secondaryButton} ${styles.back}`} onClick={onBack}>
          Back
        </button>
      )}
      {onContinue && (
        <button type="button" className={`${toolbarStyles.primaryButton} ${styles.continue}`} onClick={onContinue}>
          {continueLabel}
        </button>
      )}
    </div>
  )
}
