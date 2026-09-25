import { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Stage, Layer, Group, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import { FRAME_STYLES } from '../../../lib/frameStyles'
import { computeInnerOpening, coverScaleForRotation } from '../../../lib/frameGeometry'
import { quadToPoints } from '../../../lib/perspective'
import { buildLumaMap, lumaToLightingFactor, sampleRegionLuma } from '../../../lib/lightingSampler'
import { generateSampleImage } from '../../../lib/sampleImages'
import {
  buildAngleSweepQuad,
  generateBrickWall,
  generateDarkWall,
  generateFurnishedRoom,
  generateLowLightRoom,
  generateWhiteWall,
  type SampleImage,
} from '../../../lib/testWalls'
import type { FrameStyleConfig } from '../../../types/frame'
import { ContactShadow } from '../../CanvasStage/ContactShadow'
import { FrameMoulding } from '../../CanvasStage/FrameMoulding'
import { FramedPhoto } from '../../CanvasStage/FramedPhoto'
import { GlassAndHighlight } from '../../CanvasStage/GlassAndHighlight'
import { PerspectiveMesh } from '../../CanvasStage/PerspectiveMesh'
import styles from './RealismLab.module.css'

const WALL_SIZE = { width: 280, height: 210 }
const FRAME_SIZE = { width: 92, height: 120 }
const ANGLE_SWEEP = [0, 10, 20, 30, 45]

interface WallConditionCellProps {
  label: string
  wall: SampleImage
  style: FrameStyleConfig
  showPhoto: boolean
  photo: SampleImage
}

/** One "wall condition" preview: a synthetic wall background with a single
 * centered frame rendered through the real production primitives
 * (FrameMoulding/FramedPhoto/GlassAndHighlight/ContactShadow) — never
 * FrameNode, since FrameNode reads its transform-update callbacks straight
 * from the live composition store, and dragging/resizing a synthetic frame
 * there would push a spurious entry onto the real user's undo history. This
 * cell computes its own lighting factor from its own wall image, exactly
 * like useFrameLighting does for the real canvas. */
function WallConditionCell({ label, wall, style, showPhoto, photo }: WallConditionCellProps) {
  const [wallImage] = useImage(wall.src)

  const lightingFactor = useMemo(() => {
    if (!wallImage) return 1
    const lumaMap = buildLumaMap(wallImage)
    const fx0 = (WALL_SIZE.width / 2 - FRAME_SIZE.width / 2) / WALL_SIZE.width
    const fx1 = (WALL_SIZE.width / 2 + FRAME_SIZE.width / 2) / WALL_SIZE.width
    const fy0 = (WALL_SIZE.height / 2 - FRAME_SIZE.height / 2) / WALL_SIZE.height
    const fy1 = (WALL_SIZE.height / 2 + FRAME_SIZE.height / 2) / WALL_SIZE.height
    const luma = sampleRegionLuma(lumaMap, { x0: fx0, y0: fy0, x1: fx1, y1: fy1 })
    return lumaToLightingFactor(luma)
  }, [wallImage])

  const opening = computeInnerOpening(FRAME_SIZE.width, FRAME_SIZE.height, style)
  const innerX = opening.outerThickness + opening.innerThickness
  const innerY = innerX
  const scale = coverScaleForRotation(opening.width, opening.height, photo.width, photo.height, 0)
  const refDim = Math.min(FRAME_SIZE.width, FRAME_SIZE.height)

  return (
    <div className={styles.cell}>
      <Stage width={WALL_SIZE.width} height={WALL_SIZE.height}>
        <Layer>
          <KonvaImage image={wallImage} width={WALL_SIZE.width} height={WALL_SIZE.height} listening={false} />
          <Group x={WALL_SIZE.width / 2 - FRAME_SIZE.width / 2} y={WALL_SIZE.height / 2 - FRAME_SIZE.height / 2}>
            <ContactShadow refDim={refDim} style={style} lightingFactor={lightingFactor} width={FRAME_SIZE.width} height={FRAME_SIZE.height} />
            <FrameMoulding
              width={FRAME_SIZE.width}
              height={FRAME_SIZE.height}
              style={style}
              outerThickness={opening.outerThickness}
              innerThickness={opening.innerThickness}
              lightingFactor={lightingFactor}
            />
            <Group x={innerX} y={innerY} clipFunc={(ctx) => ctx.rect(0, 0, opening.width, opening.height)}>
              <FramedPhoto
                photo={showPhoto ? photo : null}
                transform={{ offsetX: 0, offsetY: 0, scale, rotation: 0 }}
                innerWidth={opening.width}
                innerHeight={opening.height}
              />
            </Group>
            <GlassAndHighlight x={innerX} y={innerY} width={opening.width} height={opening.height} style={style} lightingFactor={lightingFactor} />
          </Group>
        </Layer>
      </Stage>
      <p className={styles.cellLabel}>{label}</p>
    </div>
  )
}

interface AngleSweepCellProps {
  label: string
  tiltDeg: number
  wall: SampleImage
  style: FrameStyleConfig
  showPhoto: boolean
  photo: SampleImage
}

/** One angle in the perspective sweep: mirrors PerspectiveFrameNode's own
 * technique (flat off-screen render → raster snapshot → PerspectiveMesh
 * warp) inlined without click handlers or store access, so req #1's angle
 * coverage exercises the exact same warp code production uses. */
function AngleSweepCell({ label, tiltDeg, wall, style, showPhoto, photo }: AngleSweepCellProps) {
  const [wallImage] = useImage(wall.src)
  const hiddenGroupRef = useRef<Konva.Group | null>(null)
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null)

  const opening = computeInnerOpening(FRAME_SIZE.width, FRAME_SIZE.height, style)
  const innerX = opening.outerThickness + opening.innerThickness
  const innerY = innerX
  const scale = coverScaleForRotation(opening.width, opening.height, photo.width, photo.height, 0)
  const refDim = Math.min(FRAME_SIZE.width, FRAME_SIZE.height)

  useEffect(() => {
    const node = hiddenGroupRef.current
    if (!node) return
    setSourceCanvas(node.toCanvas({ pixelRatio: 2 }))
  }, [style.id, showPhoto, photo.src])

  const quad = useMemo(() => {
    const raw = buildAngleSweepQuad(FRAME_SIZE.width, FRAME_SIZE.height, tiltDeg)
    const xs = [raw.topLeft.x, raw.topRight.x, raw.bottomRight.x, raw.bottomLeft.x]
    const ys = [raw.topLeft.y, raw.topRight.y, raw.bottomRight.y, raw.bottomLeft.y]
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    const originX = (WALL_SIZE.width - w) / 2 - Math.min(...xs)
    const originY = (WALL_SIZE.height - h) / 2 - Math.min(...ys)
    const shift = (p: { x: number; y: number }) => ({ x: p.x + originX, y: p.y + originY })
    return {
      topLeft: shift(raw.topLeft),
      topRight: shift(raw.topRight),
      bottomRight: shift(raw.bottomRight),
      bottomLeft: shift(raw.bottomLeft),
    }
  }, [tiltDeg])

  return (
    <div className={styles.cell}>
      <Stage width={WALL_SIZE.width} height={WALL_SIZE.height}>
        <Layer>
          <KonvaImage image={wallImage} width={WALL_SIZE.width} height={WALL_SIZE.height} listening={false} />

          {/* Flat, unwarped source render, parked off-screen. */}
          <Group ref={hiddenGroupRef} x={-100000} y={0} listening={false}>
            <FrameMoulding width={FRAME_SIZE.width} height={FRAME_SIZE.height} style={style} outerThickness={opening.outerThickness} innerThickness={opening.innerThickness} />
            <Group x={innerX} y={innerY} clipFunc={(ctx) => ctx.rect(0, 0, opening.width, opening.height)}>
              <FramedPhoto
                photo={showPhoto ? photo : null}
                transform={{ offsetX: 0, offsetY: 0, scale, rotation: 0 }}
                innerWidth={opening.width}
                innerHeight={opening.height}
              />
            </Group>
            <GlassAndHighlight x={innerX} y={innerY} width={opening.width} height={opening.height} style={style} />
          </Group>

          <ContactShadow refDim={refDim} style={style} quadPoints={quadToPoints(quad)} />

          {sourceCanvas && (
            <PerspectiveMesh sourceCanvas={sourceCanvas} sourceWidth={sourceCanvas.width} sourceHeight={sourceCanvas.height} quad={quad} />
          )}
        </Layer>
      </Stage>
      <p className={styles.cellLabel}>{label}</p>
    </div>
  )
}

/**
 * Developer-only visual QA tool: renders the same frame style/photo across
 * several synthetic wall conditions (lighting, texture, clutter) and a
 * perspective angle sweep, so rendering-realism work can be inspected at a
 * glance instead of guessing from the one real wall photo currently loaded.
 * Entirely store-free — see WallConditionCell's doc comment for why.
 */
export function RealismLab({ onClose }: { onClose: () => void }) {
  const [styleId, setStyleId] = useState(FRAME_STYLES[0].id)
  const [showPhoto, setShowPhoto] = useState(true)
  const style = FRAME_STYLES.find((s) => s.id === styleId) ?? FRAME_STYLES[0]

  const photo = useMemo(() => generateSampleImage('portrait'), [])
  const walls = useMemo(
    () => ({
      brick: generateBrickWall(),
      white: generateWhiteWall(),
      dark: generateDarkWall(),
      furnished: generateFurnishedRoom(),
      lowLight: generateLowLightRoom(),
    }),
    [],
  )

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Realism Lab</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
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
          <button type="button" className={styles.toggleButton} onClick={() => setShowPhoto((v) => !v)}>
            {showPhoto ? 'Show Empty Opening' : 'Show Sample Photo'}
          </button>
        </div>

        <section>
          <h3 className={styles.sectionTitle}>Wall conditions</h3>
          <div className={styles.grid}>
            <WallConditionCell label="Front-facing brick" wall={walls.brick} style={style} showPhoto={showPhoto} photo={photo} />
            <WallConditionCell label="White wall" wall={walls.white} style={style} showPhoto={showPhoto} photo={photo} />
            <WallConditionCell label="Dark wall" wall={walls.dark} style={style} showPhoto={showPhoto} photo={photo} />
            <WallConditionCell label="Room with furniture" wall={walls.furnished} style={style} showPhoto={showPhoto} photo={photo} />
            <WallConditionCell label="Low-light room" wall={walls.lowLight} style={style} showPhoto={showPhoto} photo={photo} />
          </div>
        </section>

        <section>
          <h3 className={styles.sectionTitle}>Perspective angle sweep</h3>
          <div className={styles.grid}>
            {ANGLE_SWEEP.map((deg) => (
              <AngleSweepCell key={deg} label={`${deg}°`} tiltDeg={deg} wall={walls.brick} style={style} showPhoto={showPhoto} photo={photo} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
