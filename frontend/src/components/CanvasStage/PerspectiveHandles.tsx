import type { FrameInstance } from '../../types/frame'
import { useCompositionStore } from '../../state/compositionStore'
import { QuadHandles } from './QuadHandles'

interface PerspectiveHandlesProps {
  frame: FrameInstance
  /** Current workspace zoom, so handles stay a constant on-screen size. */
  viewportScale: number
}

/** Developer-mode-only draggable corner handles for a frame's perspective
 * quad. Not shown to normal customers — see the "Perspective Edit" toggle. */
export function PerspectiveHandles({ frame, viewportScale }: PerspectiveHandlesProps) {
  const updatePerspectiveCorner = useCompositionStore((s) => s.updatePerspectiveCorner)
  if (!frame.perspective) return null

  return (
    <QuadHandles
      quad={frame.perspective}
      viewportScale={viewportScale}
      onCornerDragMove={(corner, point) => updatePerspectiveCorner(frame.id, corner, point)}
    />
  )
}
