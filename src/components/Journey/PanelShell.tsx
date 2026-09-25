import { useEffect, useRef, type ReactNode } from 'react'
import { STEPS, type StepId } from '../../state/journeyStore'
import { PriceTag } from '../shared/PriceTag'
import styles from './Journey.module.css'

interface PanelShellProps {
  step: StepId
  title: string
  subtitle?: string
  /** Label of the previous step, shown as the back link. Omit on step 1. */
  backLabel?: string
  onBack?: () => void
  children: ReactNode
  footer: ReactNode
}

/**
 * The frame every step sits in: a quiet header (way back, where you are), the
 * step's own content, and a footer that always holds the one primary action.
 * On a phone the footer is pinned to the thumb; on desktop it's the bottom of
 * the side panel.
 */
export function PanelShell({ step, title, subtitle, backLabel, onBack, children, footer }: PanelShellProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const previousStep = useRef(step)

  // When the step changes, move focus to its title so keyboard and screen
  // reader users land at the start of the new content, not on a vanished button.
  useEffect(() => {
    if (previousStep.current !== step) titleRef.current?.focus({ preventScroll: true })
    previousStep.current = step
  }, [step])

  return (
    <section className={styles.panel} aria-labelledby="step-title" data-step={step}>
      <header className={styles.head}>
        {onBack ? (
          <button type="button" className="btnText" onClick={onBack}>
            <span aria-hidden>‹</span> {backLabel}
          </button>
        ) : (
          <span />
        )}
        <span className={styles.stepCount}>
          Step {step} of {STEPS.length}
        </span>
      </header>

      <div className={styles.body}>
        <h2 id="step-title" className={styles.title} tabIndex={-1} ref={titleRef}>
          {title}
        </h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <div className={styles.content}>{children}</div>
      </div>

      <footer className={styles.foot}>{footer}</footer>
    </section>
  )
}

interface StepFooterProps {
  primaryLabel: string
  onPrimary: () => void
  primaryDisabled?: boolean
  /** Show the running total beside the action. */
  showPrice?: boolean
}

/** The footer: the running price (once there's something to price) and the one
 * obvious way forward. */
export function StepFooter({ primaryLabel, onPrimary, primaryDisabled = false, showPrice = true }: StepFooterProps) {
  return (
    <div className={styles.footerRow}>
      {showPrice ? <PriceTag /> : <span />}
      <button type="button" className="btn btnPrimary" onClick={onPrimary} disabled={primaryDisabled} data-testid="primary-action">
        {primaryLabel}
      </button>
    </div>
  )
}
