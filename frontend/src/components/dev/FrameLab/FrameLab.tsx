import { useMemo, useState } from 'react'
import { Stage, Layer, Rect, Group } from 'react-konva'
import { FRAME_STYLES } from '../../../lib/frameStyles'
import { computeInnerOpening, coverScaleForRotation } from '../../../lib/frameGeometry'
import { generateSampleImage } from '../../../lib/sampleImages'
import { ContactShadow } from '../../CanvasStage/ContactShadow'
import { FrameMoulding } from '../../CanvasStage/FrameMoulding'
import { FramedPhoto } from '../../CanvasStage/FramedPhoto'
import { GlassAndHighlight } from '../../CanvasStage/GlassAndHighlight'

const STAGE_SIZE = { width: 560, height: 560 }
const FRAME_SIZE = { width: 300, height: 380 }

const swatch = (active: boolean) =>
  `flex items-center gap-2 rounded-lg border-[1.5px] px-2.5 py-2 text-xs font-semibold text-ink cursor-pointer ${
    active ? 'border-accent bg-accent-soft' : 'border-line bg-card hover:border-accent'
  }`
const toggleButton = 'min-w-[140px] flex-1 rounded-lg border border-line bg-card px-3 py-2.5 text-xs font-semibold text-ink cursor-pointer hover:bg-paper-2'

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,15,18,0.55)] p-6">
      <div className="flex max-h-[95vh] max-w-[95vw] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-base font-bold text-ink">Frame Style Lab</h2>
          <button type="button" className="rounded-[7px] border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-2" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="self-center overflow-hidden rounded-lg">
          <Stage width={STAGE_SIZE.width} height={STAGE_SIZE.height}>
            <Layer>
              <Rect width={STAGE_SIZE.width} height={STAGE_SIZE.height} fill="#e9e9ec" />
              <Group x={frameX} y={frameY}>
                <ContactShadow refDim={refDim} style={style} width={FRAME_SIZE.width} height={FRAME_SIZE.height} />

                <FrameMoulding width={FRAME_SIZE.width} height={FRAME_SIZE.height} style={style} outerThickness={opening.outerThickness} innerThickness={opening.innerThickness} />
                <Group
                  x={innerX}
                  y={innerY}
                  clipFunc={(ctx) => {
                    ctx.rect(0, 0, opening.width, opening.height)
                  }}
                >
                  <FramedPhoto photo={showPhoto ? sample : null} transform={{ offsetX: 0, offsetY: 0, scale, rotation }} innerWidth={opening.width} innerHeight={opening.height} />
                </Group>
                <GlassAndHighlight x={innerX} y={innerY} width={opening.width} height={opening.height} style={style} />
              </Group>
            </Layer>
          </Stage>
        </div>

        <div className="flex w-[560px] max-w-full flex-col gap-3 max-[640px]:w-full">
          <div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-2">
            {FRAME_STYLES.map((s) => (
              <button key={s.id} type="button" className={swatch(s.id === styleId)} onClick={() => setStyleId(s.id)} title={s.name}>
                <span className="h-[18px] w-[18px] flex-shrink-0 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: s.woodColor }} />
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={toggleButton} onClick={() => setOrientation((o) => (o === 'landscape' ? 'portrait' : 'landscape'))}>
              Photo: {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
            </button>
            <button type="button" className={toggleButton} onClick={() => setShowPhoto((v) => !v)}>
              {showPhoto ? 'Show Empty Opening' : 'Show Sample Photo'}
            </button>
            <button type="button" className={toggleButton} onClick={() => setRotation((r) => (r + 90) % 360)}>
              Rotate Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
