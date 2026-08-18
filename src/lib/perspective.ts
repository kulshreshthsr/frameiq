import type { FrameInstance, PerspectiveCorners } from '../types/frame'

export interface Point {
  x: number
  y: number
}

export type Quad = PerspectiveCorners

/** 3x3 projective matrix, row-major, normalized so m22 = 1. */
export interface Homography {
  m00: number
  m01: number
  m02: number
  m10: number
  m11: number
  m12: number
  m20: number
  m21: number
  m22: number
}

/**
 * Computes the projective transform mapping the unit square
 * (0,0)-(1,0)-(1,1)-(0,1) to an arbitrary destination quad. This is the
 * standard closed-form "square-to-quad" homography (Heckbert, "Fundamentals
 * of Texture Mapping and Image Warping", 1989) — the same math behind every
 * corner-pin / perspective-crop tool. When the quad is a parallelogram
 * (no true perspective skew) this degenerates cleanly to a plain affine map.
 */
export function computeSquareToQuadHomography(quad: Quad): Homography {
  const { topLeft: P0, topRight: P1, bottomRight: P2, bottomLeft: P3 } = quad

  const dx1 = P1.x - P2.x
  const dx2 = P3.x - P2.x
  const dx3 = P0.x - P1.x + P2.x - P3.x
  const dy1 = P1.y - P2.y
  const dy2 = P3.y - P2.y
  const dy3 = P0.y - P1.y + P2.y - P3.y

  let g = 0
  let h = 0
  const denom = dx1 * dy2 - dx2 * dy1
  if ((Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) && Math.abs(denom) > 1e-9) {
    g = (dx3 * dy2 - dx2 * dy3) / denom
    h = (dx1 * dy3 - dx3 * dy1) / denom
  }

  return {
    m00: P1.x - P0.x + g * P1.x,
    m01: P3.x - P0.x + h * P3.x,
    m02: P0.x,
    m10: P1.y - P0.y + g * P1.y,
    m11: P3.y - P0.y + h * P3.y,
    m12: P0.y,
    m20: g,
    m21: h,
    m22: 1,
  }
}

/** True — not zero — when this homography carries real perspective
 * (non-parallel converging edges), as opposed to a plain affine map. */
export function hasPerspectiveSkew(m: Homography): boolean {
  return Math.abs(m.m20) > 1e-6 || Math.abs(m.m21) > 1e-6
}

export function applyHomography(m: Homography, u: number, v: number): Point {
  const w = m.m20 * u + m.m21 * v + m.m22
  return {
    x: (m.m00 * u + m.m01 * v + m.m02) / w,
    y: (m.m10 * u + m.m11 * v + m.m12) / w,
  }
}

/** The rectangle a frame would occupy in normal (non-perspective) mode,
 * expressed as corner points — i.e. the identity/default perspective. Used
 * both to seed "Default Perspective" and to compute a shadow baseline. */
export function computeDefaultCorners(frame: Pick<FrameInstance, 'x' | 'y' | 'width' | 'height' | 'rotation'>): PerspectiveCorners {
  const { x, y, width, height, rotation } = frame
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = width / 2
  const hh = height / 2

  const rotate = (px: number, py: number): Point => ({
    x: x + px * cos - py * sin,
    y: y + px * sin + py * cos,
  })

  return {
    topLeft: rotate(-hw, -hh),
    topRight: rotate(hw, -hh),
    bottomRight: rotate(hw, hh),
    bottomLeft: rotate(-hw, hh),
  }
}

export function quadToPoints(quad: Quad): number[] {
  return [
    quad.topLeft.x, quad.topLeft.y,
    quad.topRight.x, quad.topRight.y,
    quad.bottomRight.x, quad.bottomRight.y,
    quad.bottomLeft.x, quad.bottomLeft.y,
  ]
}

/** Overall tilt angle of the quad's "width" axis (average of its top and
 * bottom edges), in radians. Zero for an unrotated rectangle. */
export function computeQuadTiltAngle(quad: Quad): number {
  const topX = quad.topRight.x - quad.topLeft.x
  const topY = quad.topRight.y - quad.topLeft.y
  const bottomX = quad.bottomRight.x - quad.bottomLeft.x
  const bottomY = quad.bottomRight.y - quad.bottomLeft.y
  return Math.atan2((topY + bottomY) / 2, (topX + bottomX) / 2)
}

export function rotateVector(x: number, y: number, angleRad: number): Point {
  return {
    x: x * Math.cos(angleRad) - y * Math.sin(angleRad),
    y: x * Math.sin(angleRad) + y * Math.cos(angleRad),
  }
}

// ---------------------------------------------------------------------------
// Wall-surface (Mode B) mapping
// ---------------------------------------------------------------------------

/** A sensible starting quad for "Select Wall": an inset rectangle, ready to
 * be dragged into place over the photographed wall surface. */
export function computeDefaultWallRegion(wall: { width: number; height: number }, marginRatio = 0.1): Quad {
  const mx = wall.width * marginRatio
  const my = wall.height * marginRatio
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: wall.width - mx, y: my },
    bottomRight: { x: wall.width - mx, y: wall.height - my },
    bottomLeft: { x: mx, y: wall.height - my },
  }
}

/** The region's effective width/height "as if viewed head-on" — the average
 * length of its two width-wise and two height-wise edges. Used as the pixel
 * scale for laying out frames inside it, so frame proportions stay sane
 * regardless of how foreshortened the region itself appears. */
export function computeRegionDimensions(region: Quad): { width: number; height: number } {
  const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
  const topLen = dist(region.topLeft, region.topRight)
  const bottomLen = dist(region.bottomLeft, region.bottomRight)
  const leftLen = dist(region.topLeft, region.bottomLeft)
  const rightLen = dist(region.topRight, region.bottomRight)
  return { width: (topLen + bottomLen) / 2, height: (leftLen + rightLen) / 2 }
}

/** A layout slot's four corners in the same normalized [0,1] space its
 * xPct/yPct/wPct/hPct already live in — i.e. before any homography is
 * applied. Any slot-level decorative rotation (collage tilt) is baked in
 * here so it composes naturally with the wall's own perspective. */
export function computeSlotCornersInUnitSpace(
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number,
  rotationDeg: number,
): Quad {
  const hw = wPct / 2
  const hh = hPct / 2
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rotate = (px: number, py: number): Point => ({
    x: xPct + px * cos - py * sin,
    y: yPct + px * sin + py * cos,
  })
  return {
    topLeft: rotate(-hw, -hh),
    topRight: rotate(hw, -hh),
    bottomRight: rotate(hw, hh),
    bottomLeft: rotate(-hw, hh),
  }
}

export function mapQuadThroughHomography(m: Homography, quad: Quad): Quad {
  return {
    topLeft: applyHomography(m, quad.topLeft.x, quad.topLeft.y),
    topRight: applyHomography(m, quad.topRight.x, quad.topRight.y),
    bottomRight: applyHomography(m, quad.bottomRight.x, quad.bottomRight.y),
    bottomLeft: applyHomography(m, quad.bottomLeft.x, quad.bottomLeft.y),
  }
}

export function quadCentroid(quad: Quad): Point {
  return {
    x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
    y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4,
  }
}

/** Pushes each corner outward from the quad's centroid by `amount` pixels
 * along the centroid→corner direction. Used to seed a second quad that
 * starts visibly offset from a first one (rather than exactly coincident) —
 * two perfectly overlapping quads' corner handles would otherwise stack at
 * identical screen positions, and whichever renders on top would silently
 * intercept every click meant for the one underneath. */
export function inflateQuad(quad: Quad, amount: number): Quad {
  const centroid = quadCentroid(quad)
  const push = (p: Point): Point => {
    const dx = p.x - centroid.x
    const dy = p.y - centroid.y
    const dist = Math.hypot(dx, dy) || 1
    const scale = (dist + amount) / dist
    return { x: centroid.x + dx * scale, y: centroid.y + dy * scale }
  }
  return {
    topLeft: push(quad.topLeft),
    topRight: push(quad.topRight),
    bottomRight: push(quad.bottomRight),
    bottomLeft: push(quad.bottomLeft),
  }
}
