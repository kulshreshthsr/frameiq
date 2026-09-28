import { DecorylLogo } from '../brand/DecorylLogo'
import { StepProgress } from '../Journey/StepProgress'
import styles from './Header.module.css'

function RestartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The marketing nav's routes are all real in-page anchors on the landing
// page (there's no separate router for account/search/cart — this product
// doesn't have those), so the header's center links point straight at the
// sections that actually exist rather than a navigation menu the app can't
// back up.
const MARKETING_LINKS = [
  { href: '#start', label: 'Design your wall' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#templates', label: 'Gallery walls' },
  { href: '#faq', label: 'FAQ' },
]

interface HeaderProps {
  /** Whether a design is in progress (shows the steps and "Start over"). */
  hasDesign: boolean
  onStartOver: () => void
  /** True once the marketing page has been scrolled past its hero — used
   * only to tighten the header slightly, never to hide anything in it. */
  compact?: boolean
}

export function Header({ hasDesign, onStartOver, compact = false }: HeaderProps) {
  return (
    <header className={`${styles.header} ${hasDesign ? styles.withDesign : ''} ${compact ? styles.compact : ''}`}>
      {hasDesign ? (
        <>
          <span className={styles.brand}>
            <DecorylLogo size={compact ? 26 : 32} />
          </span>
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
      ) : (
        <>
          <a href="#top" className={styles.brand} aria-label="Decoryl — back to top">
            <DecorylLogo size={compact ? 26 : 32} />
          </a>
          <nav className={styles.nav} aria-label="Site">
            {MARKETING_LINKS.map((link) => (
              <a key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className={styles.actions}>
            <a href="#start" className={`btn btnPrimary btnCompact ${styles.cta}`}>
              Design your wall
            </a>
          </div>
        </>
      )}
    </header>
  )
}
