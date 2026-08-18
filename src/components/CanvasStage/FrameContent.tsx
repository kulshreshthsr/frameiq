import type Konva from 'konva'
import { Group } from 'react-konva'
import type { FrameInstance, FrameStyleConfig } from '../../types/frame'
import { computeInnerOpening } from '../../lib/frameGeometry'
import { FrameMoulding } from './FrameMoulding'
import { FramedPhoto } from './FramedPhoto'
import { GlassAndHighlight } from './GlassAndHighlight'

interface FrameContentProps {
  frame: FrameInstance
  style: FrameStyleConfig
  isEditingPhoto: boolean
  /** Ambient lighting nudge sampled from the wall around this frame —
   * defaults to neutral (1). */
  lightingFactor?: number
  onPhotoDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onPhotoWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void
}

/**
 * The frame's internal visual stack — body → photograph → glass/reflection —
 * at local (0,0), sized to frame.width x frame.height. This is the single
 * source of truth for a frame's internal geometry: both normal rectangular
 * rendering (FrameNode) and perspective-warped rendering (PerspectiveFrameNode)
 * render through this exact component, so the moulding/mat/opening math can
 * never drift between the two modes.
 */
export function FrameContent({ frame, style, isEditingPhoto, lightingFactor = 1, onPhotoDragEnd, onPhotoWheel }: FrameContentProps) {
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
          isEditing={isEditingPhoto}
          onDragEnd={onPhotoDragEnd}
          onWheel={onPhotoWheel}
        />
      </Group>

      <GlassAndHighlight x={innerX} y={innerY} width={innerWidth} height={innerHeight} style={style} lightingFactor={lightingFactor} />
    </>
  )
}
