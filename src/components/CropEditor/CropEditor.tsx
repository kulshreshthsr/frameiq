import { useRef } from 'react'
import type Konva from 'konva'
import { Layer, Stage } from 'react-konva'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { resolveFrameStyle } from '../../domain/frameStyle'
import { clampPhotoPan, computeInnerOpening, coverScaleForRotation } from '../../lib/frameGeometry'
import { clamp } from '../../lib/geometry'
import { frameName } from '../../lib/frameLabels'
import type { FrameInstance } from '../../types/frame'
import { FrameContent } from '../CanvasStage/FrameContent'
import { Dialog } from '../shared/Dialog'
import styles from './CropEditor.module.css'

const MAX_STAGE_HEIGHT_RATIO = 0.42
const KEY_STEP = 12

/**
 * Where the customer positions and zooms a photo inside its frame.
 *
 * It's a modal showing the frame flat and large — rather than dragging the
 * photo on the (small, possibly perspective-warped) wall — because a phone
 * fingertip needs room, and because a warped frame can't be dragged at all.
 * The same enforcement applies as everywhere: the store clamps every change
 * so the photo always covers the opening.
 */
function Editor({ frame, index }: { frame: FrameInstance; index: number }) {
  const updateFramePhotoTransform = useCompositionStore((s) => s.updateFramePhotoTransform)
  const autoFitPhoto = useCompositionStore((s) => s.autoFitPhoto)
  const rotatePhoto90 = useCompositionStore((s) => s.rotatePhoto90)
  const close = useUIStore((s) => s.closeCropEditor)
  const pinch = useRef<number | null>(null)

  const photo = frame.photo
  const style = resolveFrameStyle(frame.productId, frame.matId)
  const opening = computeInnerOpening(frame.width, frame.height, style)

  // Fit the frame into the dialog, leaving room for the controls below it.
  const maxWidth = Math.min(360, (typeof window === 'undefined' ? 360 : window.innerWidth) - 72)
  const maxHeight = (typeof window === 'undefined' ? 600 : window.innerHeight) * MAX_STAGE_HEIGHT_RATIO
  const scale = Math.min(maxWidth / frame.width, maxHeight / frame.height)

  if (!photo) return null

  const t = frame.photoTransform
  const minScale = coverScaleForRotation(opening.width, opening.height, photo.width, photo.height, t.rotation)
  const maxScale = minScale * 4

  const clampedOffset = (x: number, y: number) =>
    clampPhotoPan(x, y, t.scale, t.rotation, opening.width, opening.height, photo.width, photo.height)

  const handlers = {
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const next = clampedOffset(e.target.x() - opening.width / 2, e.target.y() - opening.height / 2)
      e.target.position({ x: opening.width / 2 + next.offsetX, y: opening.height / 2 + next.offsetY })
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      updateFramePhotoTransform(frame.id, { offsetX: e.target.x() - opening.width / 2, offsetY: e.target.y() - opening.height / 2 })
    },
    onWheel: (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      updateFramePhotoTransform(frame.id, { scale: clamp(t.scale * (e.evt.deltaY > 0 ? 0.95 : 1.05), minScale, maxScale) })
    },
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const move = (dx: number, dy: number) => {
      e.preventDefault()
      const next = clampedOffset(t.offsetX + dx, t.offsetY + dy)
      updateFramePhotoTransform(frame.id, next)
    }
    if (e.key === 'ArrowLeft') move(-KEY_STEP, 0)
    else if (e.key === 'ArrowRight') move(KEY_STEP, 0)
    else if (e.key === 'ArrowUp') move(0, -KEY_STEP)
    else if (e.key === 'ArrowDown') move(0, KEY_STEP)
    else if (e.key === '+' || e.key === '=') updateFramePhotoTransform(frame.id, { scale: clamp(t.scale * 1.08, minScale, maxScale) })
    else if (e.key === '-') updateFramePhotoTransform(frame.id, { scale: clamp(t.scale / 1.08, minScale, maxScale) })
  }

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length !== 2) return
    e.evt.preventDefault()
    // The first finger started dragging the photo; a second means "pinch".
    e.target.getStage()?.find('Image').forEach((node) => node.stopDrag())
    const dist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY)
    if (pinch.current) updateFramePhotoTransform(frame.id, { scale: clamp(t.scale * (dist / pinch.current), minScale, maxScale) })
    pinch.current = dist
  }

  return (
    <div className={styles.editor}>
      <h2 className={styles.title}>Adjust {frameName(index)}</h2>
      <p className={styles.hint}>Drag to reposition. Pinch or use the slider to zoom.</p>

      <div
        className={styles.stageWrap}
        tabIndex={0}
        role="group"
        aria-label="Photo position. Use the arrow keys to move the photo, and plus and minus to zoom."
        onKeyDown={handleKeyDown}
      >
        <Stage
          width={frame.width * scale}
          height={frame.height * scale}
          scaleX={scale}
          scaleY={scale}
          className={styles.stage}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            pinch.current = null
          }}
        >
          <Layer>
            <FrameContent frame={frame} style={style} editing={handlers} />
          </Layer>
        </Stage>
      </div>

      <label className={styles.zoom}>
        <span>Zoom</span>
        <input
          type="range"
          min={minScale}
          max={maxScale}
          step={(maxScale - minScale) / 200 || 0.001}
          value={t.scale}
          onChange={(e) => updateFramePhotoTransform(frame.id, { scale: Number(e.target.value) })}
          aria-label="Zoom"
        />
      </label>

      <div className={styles.actions}>
        <button type="button" className="btn btnSecondary btnCompact" onClick={() => rotatePhoto90(frame.id, -1)}>
          Rotate left
        </button>
        <button type="button" className="btn btnSecondary btnCompact" onClick={() => rotatePhoto90(frame.id, 1)}>
          Rotate right
        </button>
        <button type="button" className="btn btnSecondary btnCompact" onClick={() => autoFitPhoto(frame.id)}>
          Reset
        </button>
      </div>
      <button type="button" className="btn btnPrimary btnBlock" onClick={close} data-testid="crop-done">
        Done
      </button>
    </div>
  )
}

export function CropEditor() {
  const frameId = useUIStore((s) => s.cropEditorFrameId)
  const close = useUIStore((s) => s.closeCropEditor)
  const frames = useCompositionStore((s) => s.frames)
  const index = frames.findIndex((f) => f.id === frameId)
  const frame = index >= 0 ? frames[index] : undefined

  return (
    <Dialog open={Boolean(frame?.photo)} title="Adjust photo" onClose={close}>
      {frame && <Editor frame={frame} index={index} />}
    </Dialog>
  )
}
