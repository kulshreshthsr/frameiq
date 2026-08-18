import { useState } from 'react'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { FrameLab } from '../FrameLab/FrameLab'
import { RealismLab } from '../RealismLab/RealismLab'
import { PerspectiveControls } from '../Toolbar/PerspectiveControls'
import { WallPlacementControls } from '../Toolbar/WallPlacementControls'
import toolbarStyles from '../Toolbar/Toolbar.module.css'
import styles from './DevTools.module.css'

/**
 * Everything from earlier prototype phases that isn't part of the
 * customer-facing journey (perspective corner-pinning, manual wall-surface
 * mapping, the isolated frame-style lab) lives behind this single
 * low-prominence affordance instead of cluttering the main flow.
 */
export function DevTools() {
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
      <button type="button" className={styles.toggle} onClick={() => setIsOpen((v) => !v)}>
        Advanced
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span>Advanced tools</span>
            <button type="button" className={styles.close} onClick={() => setIsOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <button type="button" className={toolbarStyles.secondaryButton} onClick={() => setShowFrameLab(true)}>
            Frame Style Lab
          </button>

          <button type="button" className={toolbarStyles.secondaryButton} onClick={() => setShowRealismLab(true)}>
            Realism Lab
          </button>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={perspectiveEditMode} onChange={togglePerspectiveEditMode} />
            Perspective corner editing
          </label>
          {perspectiveEditMode && selectedFrame && (
            <div className={styles.subsection}>
              <PerspectiveControls frame={selectedFrame} />
            </div>
          )}

          <div className={styles.subsection}>
            <p className={styles.subsectionTitle}>Wall placement</p>
            <WallPlacementControls />
          </div>
        </div>
      )}

      {showFrameLab && <FrameLab onClose={() => setShowFrameLab(false)} />}
      {showRealismLab && <RealismLab onClose={() => setShowRealismLab(false)} />}
    </>
  )
}
