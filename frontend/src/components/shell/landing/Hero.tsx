import { HeroIllustration } from './HeroIllustration'
import styles from './Hero.module.css'

/**
 * The product is the hero: a real before/after demonstration sits beside the
 * promise, not a paragraph explaining it. The actual entry point (uploading
 * a wall photo) is the very next thing on the page, not buried — "Design
 * your wall" scrolls straight to it rather than opening the file picker
 * itself, so nothing surprises the visitor before they've decided to.
 */
export function Hero() {
  return (
    <div className={styles.hero}>
      <div className={styles.grid} aria-hidden />
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className="eyebrow">Custom wall frames</p>
          <h1 className={styles.headline}>Design your wall before you buy it.</h1>
          <p className={styles.lede}>
            Upload your wall, arrange your photos and frames, and see the finished design at real sizes and real prices — before
            anything is made.
          </p>
          <div className={styles.actions}>
            <a href="#start" className="btn btnPrimary">
              Design your wall
            </a>
            <a href="#templates" className="btn btnSecondary">
              Browse gallery walls
            </a>
          </div>
          <ul className={styles.trust}>
            <li>Free to design</li>
            <li>No account required</li>
            <li>See your price instantly</li>
          </ul>
        </div>
        <div className={styles.visual}>
          <HeroIllustration />
        </div>
      </div>
    </div>
  )
}
