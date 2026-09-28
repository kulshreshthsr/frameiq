import { describe, expect, it } from 'vitest'
import type { PerspectiveCorners } from '../types/frame'
import {
  applyHomography,
  computeDefaultCorners,
  computeDefaultWallRegion,
  computeQuadTiltAngle,
  computeRectCornersInUnitSpace,
  computeRegionDimensions,
  computeSquareToQuadHomography,
  hasPerspectiveSkew,
  inflateQuad,
  mapQuadThroughHomography,
  quadCentroid,
} from './perspective'

const rect: PerspectiveCorners = {
  topLeft: { x: 100, y: 50 },
  topRight: { x: 500, y: 50 },
  bottomRight: { x: 500, y: 350 },
  bottomLeft: { x: 100, y: 350 },
}

const trapezoid: PerspectiveCorners = {
  topLeft: { x: 100, y: 50 },
  topRight: { x: 500, y: 120 },
  bottomRight: { x: 500, y: 280 },
  bottomLeft: { x: 100, y: 350 },
}

const parallelogram: PerspectiveCorners = {
  topLeft: { x: 100, y: 50 },
  topRight: { x: 500, y: 90 },
  bottomRight: { x: 550, y: 350 },
  bottomLeft: { x: 150, y: 310 },
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}

describe('computeSquareToQuadHomography', () => {
  it('maps the unit square’s corners onto the quad’s corners', () => {
    for (const quad of [rect, trapezoid, parallelogram]) {
      const h = computeSquareToQuadHomography(quad)
      near(applyHomography(h, 0, 0), quad.topLeft)
      near(applyHomography(h, 1, 0), quad.topRight)
      near(applyHomography(h, 1, 1), quad.bottomRight)
      near(applyHomography(h, 0, 1), quad.bottomLeft)
    }
  })

  it('reduces to a plain affine map for a rectangle or parallelogram (no perspective term)', () => {
    expect(hasPerspectiveSkew(computeSquareToQuadHomography(rect))).toBe(false)
    expect(hasPerspectiveSkew(computeSquareToQuadHomography(parallelogram))).toBe(false)
  })

  it('reports real perspective for a trapezoid', () => {
    expect(hasPerspectiveSkew(computeSquareToQuadHomography(trapezoid))).toBe(true)
  })

  it('preserves straight lines: the midpoint column of a trapezoid stays straight', () => {
    const h = computeSquareToQuadHomography(trapezoid)
    const a = applyHomography(h, 0.5, 0)
    const b = applyHomography(h, 0.5, 0.5)
    const c = applyHomography(h, 0.5, 1)
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    expect(Math.abs(cross)).toBeLessThan(1e-6)
  })

  it('foreshortens: equal steps in u cover fewer pixels toward the far (shorter) edge', () => {
    // On this trapezoid the left edge is the tall/near side and the right edge
    // the short/far side, so the same step in u spans more pixels on the left.
    const h = computeSquareToQuadHomography(trapezoid)
    const step = (u0: number, u1: number) => applyHomography(h, u1, 0.5).x - applyHomography(h, u0, 0.5).x
    expect(step(0, 0.25)).toBeGreaterThan(step(0.75, 1))
  })

  it('handles a strongly converging quad (steep angle) without non-finite output', () => {
    const steep: PerspectiveCorners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1000, y: 380 },
      bottomRight: { x: 1000, y: 420 },
      bottomLeft: { x: 0, y: 800 },
    }
    const h = computeSquareToQuadHomography(steep)
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const p = applyHomography(h, i / 10, j / 10)
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      }
    }
  })

  it('does not throw or return NaN for a degenerate (collinear) quad', () => {
    const line: PerspectiveCorners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 200, y: 0 },
      bottomLeft: { x: 300, y: 0 },
    }
    const h = computeSquareToQuadHomography(line)
    const p = applyHomography(h, 0.5, 0.5)
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })

  it('does not throw for a fully collapsed quad', () => {
    const dot = { x: 7, y: 7 }
    expect(() =>
      computeSquareToQuadHomography({ topLeft: dot, topRight: dot, bottomRight: dot, bottomLeft: dot }),
    ).not.toThrow()
  })
})

describe('mapQuadThroughHomography', () => {
  it('maps a quad inside the unit square to a quad inside the target', () => {
    const h = computeSquareToQuadHomography(trapezoid)
    const inner: PerspectiveCorners = {
      topLeft: { x: 0.25, y: 0.25 },
      topRight: { x: 0.75, y: 0.25 },
      bottomRight: { x: 0.75, y: 0.75 },
      bottomLeft: { x: 0.25, y: 0.75 },
    }
    const mapped = mapQuadThroughHomography(h, inner)
    const c = quadCentroid(mapped)
    expect(c.x).toBeGreaterThan(100)
    expect(c.x).toBeLessThan(500)
    expect(c.y).toBeGreaterThan(50)
    expect(c.y).toBeLessThan(350)
  })
})

describe('computeRectCornersInUnitSpace', () => {
  const region = { width: 800, height: 600 }

  it('is axis-aligned and centred with no tilt', () => {
    const q = computeRectCornersInUnitSpace({ x: 0.5, y: 0.5 }, 200, 300, 0, region)
    near(q.topLeft, { x: (400 - 100) / 800, y: (300 - 150) / 600 })
    near(q.bottomRight, { x: (400 + 100) / 800, y: (300 + 150) / 600 })
  })

  it('keeps the centre fixed under any tilt', () => {
    for (const tilt of [-45, -4, 0, 10, 90]) {
      const c = quadCentroid(computeRectCornersInUnitSpace({ x: 0.3, y: 0.7 }, 150, 220, tilt, region))
      near(c, { x: 0.3, y: 0.7 })
    }
  })

  it('a 90° tilt swaps the frame’s footprint, measured in pixels', () => {
    const q = computeRectCornersInUnitSpace({ x: 0.5, y: 0.5 }, 200, 300, 90, region)
    const wPx = Math.abs(q.topRight.x - q.topLeft.x) * region.width
    const hPx = Math.abs(q.topRight.y - q.topLeft.y) * region.height
    expect(Math.hypot(wPx, hPx)).toBeCloseTo(200)
  })

  it('does not divide by zero for a zero-size region', () => {
    const q = computeRectCornersInUnitSpace({ x: 0.5, y: 0.5 }, 100, 100, 5, { width: 0, height: 0 })
    for (const p of Object.values(q)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })
})

describe('helpers', () => {
  it('computeRegionDimensions averages opposite edges', () => {
    expect(computeRegionDimensions(rect)).toEqual({ width: 400, height: 300 })
    const dims = computeRegionDimensions(trapezoid)
    expect(dims.width).toBeCloseTo(Math.hypot(400, 70)) // top and bottom edges are the same slanted length
    expect(dims.height).toBeCloseTo((300 + 160) / 2)
  })

  it('computeDefaultCorners reproduces the identity rectangle, rotated', () => {
    const q = computeDefaultCorners({ x: 200, y: 100, width: 100, height: 60, rotation: 0 })
    near(q.topLeft, { x: 150, y: 70 })
    near(q.bottomRight, { x: 250, y: 130 })
    expect(computeQuadTiltAngle(q)).toBeCloseTo(0)
    expect((computeQuadTiltAngle(computeDefaultCorners({ x: 0, y: 0, width: 10, height: 10, rotation: 30 })) * 180) / Math.PI).toBeCloseTo(30)
  })

  it('computeDefaultWallRegion insets by the margin ratio', () => {
    const q = computeDefaultWallRegion({ width: 1000, height: 500 }, 0.1)
    near(q.topLeft, { x: 100, y: 50 })
    near(q.bottomRight, { x: 900, y: 450 })
  })

  it('inflateQuad pushes every corner outward from the centroid', () => {
    const grown = inflateQuad(rect, 20)
    const c = quadCentroid(rect)
    for (const key of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const) {
      const before = Math.hypot(rect[key].x - c.x, rect[key].y - c.y)
      const after = Math.hypot(grown[key].x - c.x, grown[key].y - c.y)
      expect(after - before).toBeCloseTo(20)
    }
  })
})
