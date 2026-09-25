import { StepProgress } from '../Journey/StepProgress'
import styles from './Header.module.css'

function RestartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface HeaderProps {
  /** Whether a design is in progress (shows the steps and "Start over"). */
  hasDesign: boolean
  onStartOver: () => void
}

export function Header({ hasDesign, onStartOver }: HeaderProps) {
  return (
    <header className={`${styles.header} ${hasDesign ? styles.withDesign : ''}`}>
      <div className={styles.brand}>Frame Engine</div>
      {hasDesign && (
        <>
          <div className={styles.progress}>
            <StepProgress />
          </div>
          <div className={styles.actions}>
            <button type="button" className={`btnText ${styles.startOverText}`} onClick={onStartOver} data-testid="start-over">
              Start over
            </button>
            <button type="button" className={styles.startOverIcon} onClick={onStartOver} aria-label="Start a new design">
              <RestartIcon />
            </button>
          </div>
        </>
      )}
    </header>
  )
}
