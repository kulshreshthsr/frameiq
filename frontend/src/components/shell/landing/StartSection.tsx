import { WallUploader } from '../../WallUploader/WallUploader'
import landing from './landing.module.css'
import styles from './StartSection.module.css'

/** The real entry point — unchanged functionally from before this redesign,
 * just given a section of its own to land in rather than sharing the hero
 * with the headline. */
export function StartSection() {
  return (
    <section id="start" className={`${landing.sectionTight} ${styles.section}`} aria-labelledby="start-heading">
      <div className={styles.inner}>
        <p className={landing.sectionEyebrow}>Step one</p>
        <h2 id="start-heading" className={styles.title}>
          Start with a photo of your own wall
        </h2>
        <p className={styles.lead}>Any wall, any room, any phone camera. You’ll mark the wall and set its width next, so everything after this is sized correctly.</p>
        <div className={styles.uploader}>
          <WallUploader />
        </div>
      </div>
    </section>
  )
}
