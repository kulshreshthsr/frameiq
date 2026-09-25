import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import type { FrameInstance } from '../../types/frame'
import styles from './DevTools.module.css'

interface PerspectiveControlsProps {
  frame: FrameInstance
}

/** Developer-only controls for pinning one frame to an angled-wall quad.
 * Only rendered in development builds, while "Perspective corner editing"
 * is on. Customers mark their wall in step 1 instead. */
export function PerspectiveControls({ frame }: PerspectiveControlsProps) {
  const setDefaultPerspective = useCompositionStore((s) => s.setDefaultPerspective)
  const clearPerspective = useCompositionStore((s) => s.clearPerspective)
  const selectFrame = useUIStore((s) => s.selectFrame)

  const isActive = Boolean(frame.perspective)

  return (
    <div className={styles.stack}>
      <p className={styles.note}>
        {isActive
          ? 'Drag the corner handles on the canvas to pin this frame to an angled wall.'
          : 'Not in perspective mode — this frame renders as a normal rectangle.'}
      </p>
      <button type="button" className="btn btnSecondary btnCompact" onClick={() => setDefaultPerspective(frame.id)}>
        Default perspective
      </button>
      <div className={styles.row}>
        <button type="button" className="btn btnSecondary btnCompact" onClick={() => clearPerspective(frame.id)} disabled={!isActive}>
          Reset
        </button>
        <button type="button" className="btn btnSecondary btnCompact" onClick={() => selectFrame(null)} disabled={!isActive}>
          Apply
        </button>
      </div>
    </div>
  )
}
