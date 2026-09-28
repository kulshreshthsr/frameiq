import { DecorylLogo } from '../../brand/DecorylLogo'
import styles from './LandingFooter.module.css'

/** Deliberately minimal — no links to Terms/Privacy/social pages that don't
 * exist yet, no invented company details. Just the brand and the real
 * sections of the site. */
export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <DecorylLogo variant="dark" size={28} />
          <p className={styles.tagline}>Custom wall frames, designed on your own wall first.</p>
        </div>
        <nav className={styles.links} aria-label="Footer">
          <a href="#start" className={styles.link}>
            Design your wall
          </a>
          <a href="#how-it-works" className={styles.link}>
            How it works
          </a>
          <a href="#templates" className={styles.link}>
            Gallery walls
          </a>
          <a href="#faq" className={styles.link}>
            FAQ
          </a>
        </nav>
      </div>
    </footer>
  )
}
