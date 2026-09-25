import { useState } from 'react'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { FrameLab } from './FrameLab/FrameLab'
import { RealismLab } from './RealismLab/RealismLab'
import { PerspectiveControls } from './PerspectiveControls'
import styles from './DevTools.module.css'

/**
 * DEVELOPMENT-ONLY tooling: the isolated frame-style lab, the realism test
 * bench, and per-frame perspective corner editing. App.tsx renders this only
 * when `import.meta.env.DEV` is true and loads it lazily, so none of it is
 * in the production bundle and none of it is reachable by a customer.
 */
export default function DevTools() {
  const [isOpen, setIsOpen] = useState(false)
  const [showFrameLab, setShowFrameLab] = useState(false)
  const [showRealismLab, setShowRealismLab] = useState(false)

  const frames = useCompositionStore((s) => s.frames)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const perspectiveEditMode = useUIStore((s) => s.perspectiveEditMode)
  const togglePerspectiveEditMode = useUIStore((s) => s.togglePerspectiveEditMode)
  const selectedFrame = frames.find((f) => f.id === selectedFrameId)

  return (
    <>
      <button type="button" className={styles.toggle} onClick={() => setIsOpen((v) => !v)} aria-label="Developer tools">
        Dev
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span>Developer tools</span>
            <button type="button" className={styles.close} onClick={() => setIsOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className={styles.stack}>
            <button type="button" className="btn btnSecondary btnCompact" onClick={() => setShowFrameLab(true)}>
              Frame Style Lab
            </button>
            <button type="button" className="btn btnSecondary btnCompact" onClick={() => setShowRealismLab(true)}>
              Realism Lab
            </button>

            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={perspectiveEditMode} onChange={togglePerspectiveEditMode} />
              Perspective corner editing
            </label>
            {perspectiveEditMode && selectedFrame && <PerspectiveControls frame={selectedFrame} />}
          </div>
        </div>
      )}

      {showFrameLab && <FrameLab onClose={() => setShowFrameLab(false)} />}
      {showRealismLab && <RealismLab onClose={() => setShowRealismLab(false)} />}
    </>
  )
}
