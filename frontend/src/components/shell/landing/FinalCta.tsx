import styles from './FinalCta.module.css'

export function FinalCta() {
  return (
    <section className={styles.section} aria-labelledby="final-cta-heading">
      <div className={styles.inner}>
        <h2 id="final-cta-heading" className={styles.title}>
          Your wall is waiting.
        </h2>
        <a href="#start" className="btn btnPrimary">
          Design your wall
        </a>
      </div>
    </section>
  )
}
