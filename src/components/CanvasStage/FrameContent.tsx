import { Group } from 'react-konva'
import type { FrameInstance, FrameStyleConfig, ImageRef } from '../../types/frame'
import { computeInnerOpening } from '../../lib/frameGeometry'
import { FrameMoulding } from './FrameMoulding'
import { FramedPhoto, type PhotoEditHandlers } from './FramedPhoto'
import { GlassAndHighlight } from './GlassAndHighlight'

interface FrameContentProps {
  frame: Pick<FrameInstance, 'width' | 'height' | 'photoTransform'> & { photo: ImageRef | null }
  style: FrameStyleConfig
  /** Ambient lighting nudge sampled from the wall around this frame —
   * defaults to neutral (1). */
  lightingFactor?: number
  /** Present only inside the crop editor. */
  editing?: PhotoEditHandlers
}

/**
 * The frame's internal visual stack — body → photograph → glass/reflection —
 * at local (0,0), sized to frame.width x frame.height. This is the single
 * source of truth for a frame's internal geometry: normal rectangular
 * rendering (FrameNode), perspective-warped rendering (PerspectiveFrameNode)
 * and the crop editor all render through this exact component, so the
 * moulding/mat/opening math can never drift between them.
 */
export function FrameContent({ frame, style, lightingFactor = 1, editing }: FrameContentProps) {
  const opening = computeInnerOpening(frame.width, frame.height, style)
  const { outerThickness, innerThickness, width: innerWidth, height: innerHeight } = opening
  const innerX = outerThickness + innerThickness
  const innerY = outerThickness + innerThickness

  return (
    <>
      <FrameMoulding
        width={frame.width}
        height={frame.height}
        style={style}
        outerThickness={outerThickness}
        innerThickness={innerThickness}
        lightingFactor={lightingFactor}
      />

      <Group
        x={innerX}
        y={innerY}
        clipFunc={(ctx) => {
          ctx.rect(0, 0, innerWidth, innerHeight)
        }}
      >
        <FramedPhoto
          photo={frame.photo}
          transform={frame.photoTransform}
          innerWidth={innerWidth}
          innerHeight={innerHeight}
          editing={editing}
        />
      </Group>

      <GlassAndHighlight x={innerX} y={innerY} width={innerWidth} height={innerHeight} style={style} lightingFactor={lightingFactor} />
    </>
  )
}
