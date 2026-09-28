import { DecorylMark } from './DecorylMark'
import styles from './DecorylLogo.module.css'

/**
 * The full lockup: mark + wordmark. `variant="dark"` is for placement on a
 * dark navy section (footer, immersive bands) — the wordmark switches to
 * ivory since navy-on-navy would disappear.
 */
export function DecorylLogo({ variant = 'light', size = 34 }: { variant?: 'light' | 'dark'; size?: number }) {
  return (
    <span className={`${styles.logo} ${variant === 'dark' ? styles.dark : ''}`}>
      <DecorylMark size={size} className={styles.mark} />
      <span className={styles.word}>Decoryl</span>
    </span>
  )
}
