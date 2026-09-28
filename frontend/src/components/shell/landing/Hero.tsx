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
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className="eyebrow">Custom wall frames</p>
          <h1 className={styles.headline}>Design your wall before you buy it.</h1>
          <p className={styles.lede}>
            Upload a photo of your own wall, arrange your photos and frames on it, and see exactly how it will look — real sizes, real
            prices, before anything is made.
          </p>
          <div className={styles.actions}>
            <a href="#start" className="btn btnPrimary">
              Design your wall
            </a>
            <a href="#how-it-works" className="btn btnSecondary">
              See how it works
            </a>
          </div>
          <p className={styles.trust}>Free to design. Your photos stay on your device until you choose to order.</p>
        </div>
        <div className={styles.visual}>
          <HeroIllustration />
        </div>
      </div>
    </div>
  )
}
