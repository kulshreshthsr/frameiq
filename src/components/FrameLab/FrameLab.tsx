import { useMemo, useState } from 'react'
import { Stage, Layer, Rect, Group } from 'react-konva'
import { FRAME_STYLES } from '../../lib/frameStyles'
import { computeInnerOpening, coverScaleForRotation } from '../../lib/frameGeometry'
import { generateSampleImage } from '../../lib/sampleImages'
import { ContactShadow } from '../CanvasStage/ContactShadow'
import { FrameMoulding } from '../CanvasStage/FrameMoulding'
import { FramedPhoto } from '../CanvasStage/FramedPhoto'
import { GlassAndHighlight } from '../CanvasStage/GlassAndHighlight'
import styles from './FrameLab.module.css'

const STAGE_SIZE = { width: 560, height: 560 }
const FRAME_SIZE = { width: 300, height: 380 }

/**
 * A small development toolbar for the frame-rendering system itself,
 * completely independent of the wall/upload flow — switch styles, toggle
 * photo orientation, and inspect the moulding/glass/highlight rendering in
 * isolation. Reuses the exact same FrameMoulding/FramedPhoto/GlassAndHighlight
 * components the real product uses, so what you see here is what customers see.
 */
export function FrameLab({ onClose }: { onClose: () => void }) {
  const [styleId, setStyleId] = useState(FRAME_STYLES[0].id)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('portrait')
  const [showPhoto, setShowPhoto] = useState(true)
  const [rotation, setRotation] = useState(0)

  const sample = useMemo(() => generateSampleImage(orientation), [orientation])
  const style = FRAME_STYLES.find((s) => s.id === styleId) ?? FRAME_STYLES[0]

  const opening = computeInnerOpening(FRAME_SIZE.width, FRAME_SIZE.height, style)
  const innerX = opening.outerThickness + opening.innerThickness
  const innerY = opening.outerThickness + opening.innerThickness
  const scale = coverScaleForRotation(opening.width, opening.height, sample.width, sample.height, rotation)
  const refDim = Math.min(FRAME_SIZE.width, FRAME_SIZE.height)

  const frameX = STAGE_SIZE.width / 2 - FRAME_SIZE.width / 2
  const frameY = STAGE_SIZE.height / 2 - FRAME_SIZE.height / 2

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Frame Style Lab</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.stageWrap}>
          <Stage width={STAGE_SIZE.width} height={STAGE_SIZE.height}>
            <Layer>
              <Rect width={STAGE_SIZE.width} height={STAGE_SIZE.height} fill="#e9e9ec" />
              <Group x={frameX} y={frameY}>
                <ContactShadow refDim={refDim} style={style} width={FRAME_SIZE.width} height={FRAME_SIZE.height} />

                <FrameMoulding
                  width={FRAME_SIZE.width}
                  height={FRAME_SIZE.height}
                  style={style}
                  outerThickness={opening.outerThickness}
                  innerThickness={opening.innerThickness}
                />
                <Group
                  x={innerX}
                  y={innerY}
                  clipFunc={(ctx) => {
                    ctx.rect(0, 0, opening.width, opening.height)
                  }}
                >
                  <FramedPhoto
                    photo={showPhoto ? sample : null}
                    transform={{ offsetX: 0, offsetY: 0, scale, rotation }}
                    innerWidth={opening.width}
                    innerHeight={opening.height}
                    isEditing={false}
                    onDragEnd={() => {}}
                    onWheel={() => {}}
                  />
                </Group>
                <GlassAndHighlight x={innerX} y={innerY} width={opening.width} height={opening.height} style={style} />
              </Group>
            </Layer>
          </Stage>
        </div>

        <div className={styles.controls}>
          <div className={styles.swatchRow}>
            {FRAME_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.swatch} ${s.id === styleId ? styles.swatchActive : ''}`}
                onClick={() => setStyleId(s.id)}
                title={s.name}
              >
                <span className={styles.swatchColor} style={{ background: s.woodColor }} />
                {s.name}
              </button>
            ))}
          </div>

          <div className={styles.toggleRow}>
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setOrientation((o) => (o === 'landscape' ? 'portrait' : 'landscape'))}
            >
              Photo: {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
            </button>
            <button type="button" className={styles.toggleButton} onClick={() => setShowPhoto((v) => !v)}>
              {showPhoto ? 'Show Empty Opening' : 'Show Sample Photo'}
            </button>
            <button type="button" className={styles.toggleButton} onClick={() => setRotation((r) => (r + 90) % 360)}>
              Rotate Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
