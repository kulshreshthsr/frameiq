import { memo } from 'react'
import { Group, Rect } from 'react-konva'
import type Konva from 'konva'
import type { FrameInstance, FrameStyleConfig } from '../../types/frame'
import { useCompositionStore } from '../../state/compositionStore'
import { ContactShadow } from './ContactShadow'
import { FrameContent } from './FrameContent'
import { PerspectiveFrameNode } from './PerspectiveFrameNode'

interface FrameNodeProps {
  frame: FrameInstance
  style: FrameStyleConfig
  isSelected: boolean
  /** Whether the customer can currently tap/drag frames (steps 3–5). */
  interactive: boolean
  /** Current zoom, so outlines keep a constant on-screen width. */
  viewportScale: number
  /** Ambient lighting nudge sampled from the wall around this frame (see
   * useFrameLighting) — defaults to neutral (1) when not provided. */
  lightingFactor?: number
  onActivate: (frameId: string) => void
}

/**
 * Coordinates one frame's interactions (select, and drag when placed freely)
 * and composes the visual stack in the required order: shadow (this Group) →
 * frame body → photograph → glass/reflection → frame highlights. Each stage
 * is a distinct Konva node — nothing is flattened into a single image while
 * editing.
 *
 * A frame with perspective corners set is delegated entirely to
 * PerspectiveFrameNode instead — this normal path is untouched by that mode.
 *
 * Memoized: the canvas re-renders on every pan/zoom tick, but a frame only
 * needs to when its own data (or the zoom, for outline width) changes.
 */
export const FrameNode = memo(function FrameNode({
  frame,
  style,
  isSelected,
  interactive,
  viewportScale,
  lightingFactor = 1,
  onActivate,
}: FrameNodeProps) {
  const updateFrameTransform = useCompositionStore((s) => s.updateFrameTransform)
  const refDim = Math.min(frame.width, frame.height)

  if (frame.perspective) {
    return (
      <PerspectiveFrameNode
        frame={frame}
        style={style}
        isSelected={isSelected}
        interactive={interactive}
        viewportScale={viewportScale}
        lightingFactor={lightingFactor}
        onActivate={onActivate}
      />
    )
  }

  const handleActivate = () => {
    if (interactive) onActivate(frame.id)
  }

  return (
    <Group
      x={frame.x}
      y={frame.y}
      offsetX={frame.width / 2}
      offsetY={frame.height / 2}
      rotation={frame.rotation}
      listening={interactive}
      draggable={interactive}
      onClick={handleActivate}
      onTap={handleActivate}
      onDragStart={handleActivate}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        if (e.target !== e.currentTarget) return
        updateFrameTransform(frame.id, { x: e.target.x(), y: e.target.y() })
      }}
    >
      <ContactShadow refDim={refDim} style={style} lightingFactor={lightingFactor} width={frame.width} height={frame.height} />

      <FrameContent frame={frame} style={style} lightingFactor={lightingFactor} />

      {isSelected && (
        <>
          <Rect width={frame.width} height={frame.height} stroke="#ffffff" strokeWidth={5 / viewportScale} listening={false} />
          <Rect width={frame.width} height={frame.height} stroke="#b4532a" strokeWidth={2.5 / viewportScale} listening={false} />
        </>
      )}
    </Group>
  )
})
