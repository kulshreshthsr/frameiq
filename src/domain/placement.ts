import type { FrameGeometry, PerspectiveCorners, SurfaceAnchor } from '../types/frame'
import {
  computeQuadTiltAngle,
  computeRectCornersInUnitSpace,
  computeRegionDimensions,
  computeSquareToQuadHomography,
  mapQuadThroughHomography,
  quadCentroid,
} from '../lib/perspective'
import { sanitizeWallWidthCm } from './sizing'

/**
 * FRAME PLACEMENT: layout slot + physical size → pixels.
 *
 * Three ideas are kept deliberately separate:
 *   1. ANCHOR  — where a frame's centre sits, as a fraction of the placement
 *      surface (comes from the layout slot, or from the customer dragging).
 *   2. SIZE    — a real catalog size in centimetres (comes from the product).
 *   3. SCALE   — pixels per centimetre, from the customer's wall width.
 *
 * The frame's footprint is `sizeCm × pxPerCm`, so a layout slot can never
 * distort a frame: the slot decides WHERE, the catalog decides HOW BIG, and
 * the SKU's own proportions are used untouched.
 *
 * The placement surface is the whole wall photo ("free" mode) or the
 * customer-marked wall region ("wall-surface" mode). In wall-surface mode the
 * region is treated as a head-on rectangle of the average edge lengths (see
 * computeRegionDimensions); the frame is laid out on that rectangle in unit
 * space and the whole thing is then carried through the region's homography,
 * so relative spacing and foreshortening stay consistent across the wall.
 */

export type PlacementMode = 'free' | 'wall-surface'

export interface PlacementSurface {
  wall: { width: number; height: number }
  mode: PlacementMode
  region: PerspectiveCorners | null
  /** Approximate real width of the surface, in centimetres. */
  wallWidthCm: number
}

export interface FramePlacementInput {
  anchor: SurfaceAnchor
  tilt: number
  widthCm: number
  heightCm: number
}

/** The surface's size in pixels as if viewed head-on. */
export function surfaceDimensionsPx(surface: PlacementSurface): { width: number; height: number } {
  if (surface.mode === 'wall-surface' && surface.region) return computeRegionDimensions(surface.region)
  return { width: surface.wall.width, height: surface.wall.height }
}

export function pxPerCm(surface: PlacementSurface): number {
  const { width } = surfaceDimensionsPx(surface)
  return width / sanitizeWallWidthCm(surface.wallWidthCm)
}

/** The surface's real height in cm, inferred from its pixel aspect ratio. */
export function surfaceHeightCm(surface: PlacementSurface): number {
  const dims = surfaceDimensionsPx(surface)
  return dims.width > 0 ? sanitizeWallWidthCm(surface.wallWidthCm) * (dims.height / dims.width) : 0
}

export function computeFrameGeometry(input: FramePlacementInput, surface: PlacementSurface): FrameGeometry {
  const dims = surfaceDimensionsPx(surface)
  const scale = pxPerCm(surface)
  const width = input.widthCm * scale
  const height = input.heightCm * scale

  if (surface.mode === 'wall-surface' && surface.region) {
    const homography = computeSquareToQuadHomography(surface.region)
    const unitCorners = computeRectCornersInUnitSpace(
      { x: input.anchor.xPct, y: input.anchor.yPct },
      width,
      height,
      input.tilt,
      dims,
    )
    const perspective = mapQuadThroughHomography(homography, unitCorners)
    const centroid = quadCentroid(perspective)
    return {
      x: centroid.x,
      y: centroid.y,
      width,
      height,
      rotation: (computeQuadTiltAngle(perspective) * 180) / Math.PI,
      perspective,
    }
  }

  return {
    x: input.anchor.xPct * surface.wall.width,
    y: input.anchor.yPct * surface.wall.height,
    width,
    height,
    rotation: input.tilt,
    perspective: undefined,
  }
}

/** Where a dragged frame (free mode only) now sits, as an anchor. */
export function anchorFromPixels(x: number, y: number, wall: { width: number; height: number }): SurfaceAnchor {
  return { xPct: wall.width > 0 ? x / wall.width : 0.5, yPct: wall.height > 0 ? y / wall.height : 0.5 }
}
