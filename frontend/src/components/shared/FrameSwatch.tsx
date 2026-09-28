import { memo } from 'react'
import { Group, Image as KonvaImage, Layer, Rect, Stage } from 'react-konva'
import useImage from 'use-image'
import type { ImageRef } from '../../types/frame'
import { type MatId } from '../../domain/catalog'
import { resolveFrameStyle } from '../../domain/frameStyle'
import { computeInnerOpening } from '../../lib/frameGeometry'
import { coverScale } from '../../lib/geometry'
import { ContactShadow } from '../CanvasStage/ContactShadow'
import { FrameMoulding } from '../CanvasStage/FrameMoulding'
import { GlassAndHighlight } from '../CanvasStage/GlassAndHighlight'

interface FrameSwatchProps {
  productId: string
  matId: MatId
  /** The customer's own photo, so each option shows their picture framed. */
  photo: ImageRef | null
  frameWidth?: number
  frameHeight?: number
}

const PAD = 10

/**
 * A faithful miniature of a real frame: the same moulding, mat, glass and
 * shadow primitives the wall itself is drawn with, at swatch size — so what a
 * customer picks is what they'll see on the wall, not an approximation.
 */
export const FrameSwatch = memo(function FrameSwatch({ productId, matId, photo, frameWidth = 72, frameHeight = 92 }: FrameSwatchProps) {
  const style = resolveFrameStyle(productId, matId)
  const [image] = useImage(photo?.src ?? '')
  const opening = computeInnerOpening(frameWidth, frameHeight, style)
  const inset = opening.outerThickness + opening.innerThickness
  const refDim = Math.min(frameWidth, frameHeight)

  const scale = image && photo ? coverScale(opening.width, opening.height, photo.width, photo.height) : 1

  return (
    <Stage width={frameWidth + PAD * 2} height={frameHeight + PAD * 2} listening={false} aria-hidden>
      <Layer>
        <Group x={PAD} y={PAD - 2}>
          <ContactShadow refDim={refDim} style={style} width={frameWidth} height={frameHeight} />
          <FrameMoulding
            width={frameWidth}
            height={frameHeight}
            style={style}
            outerThickness={opening.outerThickness}
            innerThickness={opening.innerThickness}
          />
          <Group x={inset} y={inset} clipFunc={(ctx) => ctx.rect(0, 0, opening.width, opening.height)}>
            {image && photo ? (
              <KonvaImage
                image={image}
                x={opening.width / 2}
                y={opening.height / 2}
                offsetX={photo.width / 2}
                offsetY={photo.height / 2}
                scaleX={scale}
                scaleY={scale}
              />
            ) : (
              <Rect
                width={opening.width}
                height={opening.height}
                fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                fillLinearGradientEndPoint={{ x: opening.width, y: opening.height }}
                fillLinearGradientColorStops={[0, '#c9bda8', 1, '#ebe3d3']}
              />
            )}
          </Group>
          <GlassAndHighlight x={inset} y={inset} width={opening.width} height={opening.height} style={style} />
        </Group>
      </Layer>
    </Stage>
  )
})
