import { Line } from 'react-konva'
import type { PerspectiveCorners } from '../../types/frame'
import { quadToPoints } from '../../lib/perspective'

interface WallRegionOverlayProps {
  region: PerspectiveCorners
}

/** A soft tint over the marked wall, so it's obvious which part of the photo
 * the frames are being laid out on. Sits above the wall photo, below the frames. */
export function WallRegionOverlay({ region }: WallRegionOverlayProps) {
  return <Line points={quadToPoints(region)} closed fill="rgba(180,83,42,0.14)" listening={false} />
}
