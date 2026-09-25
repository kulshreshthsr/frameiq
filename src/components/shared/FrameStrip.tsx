import type { FrameInstance } from '../../types/frame'
import { describeFrame } from '../../lib/frameLabels'
import styles from './shared.module.css'

interface FrameStripProps {
  frames: FrameInstance[]
  /** null means "all frames" when `showAll` is set. */
  selectedId: string | null
  onSelect: (frameId: string | null) => void
  showAll?: boolean
}

/**
 * A row of numbered frame chips — the customer's handle on "which frame am I
 * changing?". Tapping a frame on the wall is fiddly on a phone (and the
 * canvas isn't reachable by keyboard), so every frame is also selectable
 * from here, with a thumbnail of its photo.
 */
export function FrameStrip({ frames, selectedId, onSelect, showAll = false }: FrameStripProps) {
  return (
    <div className={`scroller ${styles.strip}`} role="group" aria-label="Choose a frame">
      {showAll && (
        <button
          type="button"
          className={`${styles.chip} ${selectedId === null ? styles.chipActive : ''}`}
          aria-pressed={selectedId === null}
          onClick={() => onSelect(null)}
        >
          <span className={styles.chipThumb} aria-hidden>
            All
          </span>
          <span className={styles.chipLabel}>All frames</span>
        </button>
      )}
      {frames.map((frame, index) => (
        <button
          key={frame.id}
          type="button"
          className={`${styles.chip} ${selectedId === frame.id ? styles.chipActive : ''}`}
          aria-pressed={selectedId === frame.id}
          aria-label={describeFrame(frame, index)}
          onClick={() => onSelect(frame.id)}
        >
          <span
            className={styles.chipThumb}
            style={frame.photo ? { backgroundImage: `url("${frame.photo.src}")` } : undefined}
            aria-hidden
          >
            {!frame.photo && '+'}
          </span>
          <span className={styles.chipLabel}>Frame {index + 1}</span>
        </button>
      ))}
    </div>
  )
}
