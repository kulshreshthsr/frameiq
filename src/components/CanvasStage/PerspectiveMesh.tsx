import { Shape } from 'react-konva'
import { applyHomography, computeSquareToQuadHomography, hasPerspectiveSkew, type Quad } from '../../lib/perspective'

interface PerspectiveMeshProps {
  sourceCanvas: HTMLCanvasElement
  sourceWidth: number
  sourceHeight: number
  quad: Quad
  gridSize?: number
}

// Each cell is drawn slightly larger than its nominal unit square so
// neighbouring tiles overlap by a hair instead of leaving a hairline gap —
// otherwise each tile's own edge anti-aliasing shows up as a visible seam.
const OVERSCAN = 0.015

// A freeform four-corner drag (e.g. the perspective debug tool) can produce
// a degenerate or self-intersecting quad where applyHomography's w
// denominator approaches zero *inside* the sampled domain, not just at the
// corners — that blows a cell's affine coefficients up toward huge/non-finite
// values, which can throw or stall the tab on drawImage. Any coefficient
// past this bound (well beyond any real on-screen pixel distance) means the
// underlying quad is degenerate for this cell; skip drawing it rather than
// let a bad drag freeze the canvas.
const MAX_FINITE_COEFF = 1e6

/**
 * Warps a flat rectangular raster onto an arbitrary quadrilateral using true
 * projective (homography) math, not a single affine skew. Canvas 2D has no
 * built-in projective transform, so the source is subdivided into a grid of
 * small cells; each cell is placed with its own affine transform computed
 * from the homography at that cell's corners. For small enough cells this
 * is visually indistinguishable from a per-pixel warp — the same technique
 * used by non-WebGL corner-pin implementations generally.
 */
export function PerspectiveMesh({ sourceCanvas, sourceWidth, sourceHeight, quad, gridSize = 8 }: PerspectiveMeshProps) {
  const homography = computeSquareToQuadHomography(quad)

  // A parallelogram (no real perspective skew) is exactly representable by
  // a single affine transform — skip subdividing in that common case.
  const effectiveGridSize = hasPerspectiveSkew(homography) ? gridSize : 1

  const cells = []
  for (let j = 0; j < effectiveGridSize; j++) {
    for (let i = 0; i < effectiveGridSize; i++) {
      const u0 = i / effectiveGridSize
      const u1 = (i + 1) / effectiveGridSize
      const v0 = j / effectiveGridSize
      const v1 = (j + 1) / effectiveGridSize

      const destTL = applyHomography(homography, u0, v0)
      const destTR = applyHomography(homography, u1, v0)
      const destBL = applyHomography(homography, u0, v1)

      // Affine transform mapping this cell's local unit square (0,0)-(1,0)-(0,1)
      // to destTL/destTR/destBL — the 4th corner (destBR) is left to fall
      // where the affine map puts it, which for small cells is sub-pixel
      // close to its true projective position.
      const a = destTR.x - destTL.x
      const b = destTR.y - destTL.y
      const c = destBL.x - destTL.x
      const d = destBL.y - destTL.y
      const e = destTL.x
      const f = destTL.y

      const coeffsAreSane = [a, b, c, d, e, f].every((v) => Number.isFinite(v) && Math.abs(v) < MAX_FINITE_COEFF)
      if (!coeffsAreSane) continue

      // Overscan in normalized [0,1] source space, clamped to the source's
      // true bounds (no neighbour to seam against at the outer edge anyway).
      const cellU = u1 - u0
      const cellV = v1 - v0
      const su0 = Math.max(0, u0 - OVERSCAN * cellU)
      const su1 = Math.min(1, u1 + OVERSCAN * cellU)
      const sv0 = Math.max(0, v0 - OVERSCAN * cellV)
      const sv1 = Math.min(1, v1 + OVERSCAN * cellV)

      const srcX = su0 * sourceWidth
      const srcY = sv0 * sourceHeight
      const srcW = (su1 - su0) * sourceWidth
      const srcH = (sv1 - sv0) * sourceHeight

      // Where that (possibly asymmetric, near a true edge) overscanned crop
      // lands within this cell's own local unit square.
      const localX0 = (su0 - u0) / cellU
      const localY0 = (sv0 - v0) / cellV
      const localX1 = (su1 - u0) / cellU
      const localY1 = (sv1 - v0) / cellV

      cells.push(
        <Shape
          key={`${i}-${j}`}
          listening={false}
          sceneFunc={(ctx) => {
            ctx.save()
            ctx.transform(a, b, c, d, e, f)
            ctx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, localX0, localY0, localX1 - localX0, localY1 - localY0)
            ctx.restore()
          }}
        />,
      )
    }
  }

  return <>{cells}</>
}
