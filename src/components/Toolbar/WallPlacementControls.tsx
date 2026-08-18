import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import styles from './Toolbar.module.css'

/**
 * Mode A (free) vs Mode B (wall-surface) switcher, plus the Select Wall /
 * redraw flow for Mode B. The four-corner click sequence itself happens on
 * the canvas (see CanvasStage) — this panel drives it and shows status.
 */
export function WallPlacementControls() {
  const placementMode = useCompositionStore((s) => s.placementMode)
  const wallRegion = useCompositionStore((s) => s.wallRegion)
  const setPlacementMode = useCompositionStore((s) => s.setPlacementMode)
  const resetWallRegion = useCompositionStore((s) => s.resetWallRegion)
  const isSelectingWall = useUIStore((s) => s.isSelectingWall)
  const startWallSelection = useUIStore((s) => s.startWallSelection)
  const stopWallSelection = useUIStore((s) => s.stopWallSelection)

  return (
    <div>
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={placementMode === 'free' ? styles.primaryButton : styles.secondaryButton}
          onClick={() => {
            if (isSelectingWall) stopWallSelection()
            setPlacementMode('free')
          }}
        >
          Free Placement
        </button>
        <button
          type="button"
          className={placementMode === 'wall-surface' ? styles.primaryButton : styles.secondaryButton}
          onClick={() => setPlacementMode('wall-surface')}
        >
          Wall Surface
        </button>
      </div>

      {placementMode === 'free' && (
        <p className={styles.sectionHint}>Frames sit directly on the wall photo, unwarped.</p>
      )}

      {placementMode === 'wall-surface' && (
        <>
          {!wallRegion && !isSelectingWall && (
            <>
              <button type="button" className={styles.secondaryButton} onClick={startWallSelection}>
                Select Wall
              </button>
              <p className={styles.sectionHint}>
                Mark the flat wall surface in the photo — the whole layout will be mapped onto it with a
                matching perspective.
              </p>
            </>
          )}
          {isSelectingWall && (
            <>
              <button type="button" className={styles.secondaryButton} onClick={stopWallSelection}>
                Cancel
              </button>
              <p className={styles.sectionHint}>
                Click the wall&apos;s four corners on the canvas, in order: top-left, top-right, bottom-right,
                bottom-left.
              </p>
            </>
          )}
          {wallRegion && !isSelectingWall && (
            <>
              <button type="button" className={styles.secondaryButton} onClick={resetWallRegion}>
                Redraw Wall Selection
              </button>
              <p className={styles.sectionHint}>Drag the corner handles on the canvas to fine-tune the wall surface.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}
