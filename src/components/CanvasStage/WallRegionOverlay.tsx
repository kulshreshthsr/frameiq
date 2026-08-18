import { Line } from 'react-konva'
import type { PerspectiveCorners } from '../../types/frame'
import { quadToPoints } from '../../lib/perspective'

interface WallRegionOverlayProps {
  region: PerspectiveCorners
}

/** Persistent highlight for the customer-selected wall surface — a soft
 * fill plus a solid outline, so it's obvious which part of the photo the
 * layout is being mapped into. Sits above the wall photo, below the frames. */
export function WallRegionOverlay({ region }: WallRegionOverlayProps) {
  const points = quadToPoints(region)
  return (
    <>
      <Line points={points} closed fill="rgba(47,143,255,0.12)" listening={false} />
      <Line points={points} closed stroke="rgba(47,143,255,0.85)" strokeWidth={2} listening={false} />
    </>
  )
}
