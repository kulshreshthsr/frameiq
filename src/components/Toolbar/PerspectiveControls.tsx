import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import type { FrameInstance } from '../../types/frame'
import styles from './Toolbar.module.css'

interface PerspectiveControlsProps {
  frame: FrameInstance
}

/** Developer-only controls for pinning a frame to an angled-wall quad.
 * Only rendered while "Perspective Edit" mode is on — see the toggle in
 * the top-right corner of the app. */
export function PerspectiveControls({ frame }: PerspectiveControlsProps) {
  const setDefaultPerspective = useCompositionStore((s) => s.setDefaultPerspective)
  const clearPerspective = useCompositionStore((s) => s.clearPerspective)
  const selectFrame = useUIStore((s) => s.selectFrame)

  const isActive = Boolean(frame.perspective)

  return (
    <div className={styles.cropControls}>
      <p className={styles.sectionHint}>
        {isActive
          ? 'Drag the corner handles on the canvas to pin this frame to an angled wall.'
          : 'Not yet in perspective mode — this frame renders as a normal rectangle.'}
      </p>
      <button type="button" className={styles.secondaryButton} onClick={() => setDefaultPerspective(frame.id)}>
        Default Perspective
      </button>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryButton} onClick={() => clearPerspective(frame.id)} disabled={!isActive}>
          Reset Perspective
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => selectFrame(null)}
          disabled={!isActive}
        >
          Apply Perspective
        </button>
      </div>
    </div>
  )
}
