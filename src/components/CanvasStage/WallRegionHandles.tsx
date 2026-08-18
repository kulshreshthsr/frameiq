import type { PerspectiveCorners } from '../../types/frame'
import { useCompositionStore } from '../../state/compositionStore'
import { QuadHandles } from './QuadHandles'

interface WallRegionHandlesProps {
  region: PerspectiveCorners
  viewportScale: number
}

/** Draggable corner handles for the customer-selected wall surface (Mode B).
 * Distinct orange color from the per-frame perspective handles so the two
 * concepts stay visually separate if both happen to be active at once. */
export function WallRegionHandles({ region, viewportScale }: WallRegionHandlesProps) {
  const updateWallRegionCorner = useCompositionStore((s) => s.updateWallRegionCorner)

  return (
    <QuadHandles
      quad={region}
      viewportScale={viewportScale}
      onCornerDragMove={updateWallRegionCorner}
      color="#e08a1e"
    />
  )
}
