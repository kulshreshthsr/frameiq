import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { getFrameStyle } from '../../lib/frameStyles'
import { computeInnerOpening, coverScaleForRotation } from '../../lib/frameGeometry'
import type { FrameInstance } from '../../types/frame'
import styles from './Toolbar.module.css'

interface PhotoCropControlsProps {
  frame: FrameInstance
}

/** The "clean crop interaction" for a selected frame's photo: an explicit
 * edit-mode toggle, a zoom slider, quarter-turn rotate, and Auto Fit —
 * surfacing the same pan/zoom/rotate gestures available on the canvas as
 * discoverable controls instead of hidden double-click/scroll behavior. */
export function PhotoCropControls({ frame }: PhotoCropControlsProps) {
  const editingPhotoFrameId = useUIStore((s) => s.editingPhotoFrameId)
  const setEditingPhoto = useUIStore((s) => s.setEditingPhoto)
  const updateFramePhotoTransform = useCompositionStore((s) => s.updateFramePhotoTransform)
  const autoFitPhoto = useCompositionStore((s) => s.autoFitPhoto)
  const rotatePhoto90 = useCompositionStore((s) => s.rotatePhoto90)

  if (!frame.photo) return null

  const isEditing = editingPhotoFrameId === frame.id
  const isPerspective = Boolean(frame.perspective)
  const style = getFrameStyle(frame.styleId)
  const opening = computeInnerOpening(frame.width, frame.height, style)
  const minScale = coverScaleForRotation(opening.width, opening.height, frame.photo.width, frame.photo.height, frame.photoTransform.rotation)
  const maxScale = minScale * 4

  return (
    <div className={styles.cropControls}>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={() => setEditingPhoto(isEditing ? null : frame.id)}
        disabled={isPerspective}
        title={isPerspective ? 'Drag-to-reposition is unavailable on a perspective-warped frame — use Zoom/Rotate/Auto Fit instead.' : undefined}
      >
        {isEditing ? 'Done Adjusting' : 'Adjust Photo'}
      </button>

      <label className={styles.sliderRow}>
        <span>Zoom</span>
        <input
          type="range"
          min={minScale}
          max={maxScale}
          step={(maxScale - minScale) / 200 || 0.001}
          value={frame.photoTransform.scale}
          onChange={(e) => updateFramePhotoTransform(frame.id, { scale: Number(e.target.value) })}
        />
      </label>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryButton} onClick={() => rotatePhoto90(frame.id, -1)}>
          Rotate ⟲
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => rotatePhoto90(frame.id, 1)}>
          Rotate ⟳
        </button>
      </div>

      <button type="button" className={styles.secondaryButton} onClick={() => autoFitPhoto(frame.id)}>
        Auto Fit
      </button>

      <p className={styles.sectionHint}>
        {isPerspective
          ? 'This frame is perspective-warped, so on-canvas dragging is off — zoom/rotate/Auto Fit still work.'
          : isEditing
            ? 'Drag the photo to reposition it. Scroll to zoom, shift+scroll to fine-rotate.'
            : 'Adjust Photo to drag/zoom it directly on the canvas, or use the controls above.'}
      </p>
    </div>
  )
}
