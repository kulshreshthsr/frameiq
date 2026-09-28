import styles from './LandingFooter.module.css'

/** Deliberately minimal — no links to Terms/Privacy/social pages that don't
 * exist yet, no invented company details. Just the brand and a way back to
 * the top. */
export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>Frame Engine</span>
        <p className={styles.tagline}>Custom wall frames, designed on your own wall first.</p>
        <a href="#start" className={styles.link}>
          Design your wall ↑
        </a>
      </div>
    </footer>
  )
}
