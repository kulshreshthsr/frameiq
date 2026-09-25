import type { PerspectiveCorners } from '../../types/frame'
import { useCompositionStore } from '../../state/compositionStore'
import { QuadHandles } from './QuadHandles'

interface WallRegionHandlesProps {
  region: PerspectiveCorners
  viewportScale: number
  wall: { width: number; height: number }
}

/** Draggable corner handles for the wall the customer marked. Accent-coloured
 * so they read as "yours to move", distinct from anything else on the canvas. */
export function WallRegionHandles({ region, viewportScale, wall }: WallRegionHandlesProps) {
  const updateWallRegionCorner = useCompositionStore((s) => s.updateWallRegionCorner)

  return (
    <QuadHandles
      quad={region}
      viewportScale={viewportScale}
      onCornerDragMove={updateWallRegionCorner}
      color="#b4532a"
      bounds={wall}
    />
  )
}
