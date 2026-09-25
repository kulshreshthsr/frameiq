import { WallUploader } from '../WallUploader/WallUploader'
import styles from './Landing.module.css'

/** The first screen. It has one job: make the promise obvious ("see your
 * photos framed on your own wall") and put the first step right under the
 * customer's thumb. */
export function Landing() {
  return (
    <div className={styles.landing}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className="eyebrow">Custom frames</p>
          <h1 className={styles.headline}>See your photos framed on your own wall.</h1>
          <p className={styles.lede}>
            Upload a photo of your wall, add your pictures, and choose your frames. You’ll see exactly how they’ll look — in the right
            sizes, with the price as you go.
          </p>
          <ol className={styles.steps}>
            <li>Upload your wall</li>
            <li>Add your photos</li>
            <li>See it framed</li>
          </ol>
          <p className={styles.privacy}>Your photos stay on your device.</p>
        </div>
        <div className={styles.upload}>
          <WallUploader />
        </div>
      </div>
    </div>
  )
}
