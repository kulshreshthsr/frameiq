import { describe, expect, it } from 'vitest'
import type { PerspectiveCorners } from '../types/frame'
import { CM_PER_INCH } from './sizing'
import { anchorFromPixels, computeFrameGeometry, pxPerCm, surfaceDimensionsPx, surfaceHeightCm, type PlacementSurface } from './placement'

const WALL = { width: 1200, height: 900 }
const cm = (inches: number) => inches * CM_PER_INCH

const freeSurface = (wallWidthCm = 300): PlacementSurface => ({ wall: WALL, mode: 'free', region: null, wallWidthCm })

const rectRegion: PerspectiveCorners = {
  topLeft: { x: 200, y: 100 },
  topRight: { x: 1000, y: 100 },
  bottomRight: { x: 1000, y: 700 },
  bottomLeft: { x: 200, y: 700 },
}

// A wall photographed at an angle: the far (right) edge is shorter.
const angledRegion: PerspectiveCorners = {
  topLeft: { x: 150, y: 80 },
  topRight: { x: 1000, y: 200 },
  bottomRight: { x: 1000, y: 650 },
  bottomLeft: { x: 150, y: 820 },
}

describe('scale', () => {
  it('derives pixels-per-cm from the wall width in free mode', () => {
    expect(pxPerCm(freeSurface(300))).toBeCloseTo(4) // 1200px / 300cm
    expect(pxPerCm(freeSurface(600))).toBeCloseTo(2)
  })

  it('uses the marked wall region as the surface in wall-surface mode', () => {
    const surface: PlacementSurface = { wall: WALL, mode: 'wall-surface', region: rectRegion, wallWidthCm: 400 }
    expect(surfaceDimensionsPx(surface)).toEqual({ width: 800, height: 600 })
    expect(pxPerCm(surface)).toBeCloseTo(2) // 800px / 400cm
    expect(surfaceHeightCm(surface)).toBeCloseTo(300) // 400cm × (600/800)
  })

  it('falls back to free behaviour when wall-surface mode has no region', () => {
    const surface: PlacementSurface = { wall: WALL, mode: 'wall-surface', region: null, wallWidthCm: 300 }
    expect(surfaceDimensionsPx(surface)).toEqual(WALL)
  })

  it('ignores an invalid wall width instead of dividing by zero', () => {
    expect(Number.isFinite(pxPerCm(freeSurface(0)))).toBe(true)
    expect(Number.isFinite(pxPerCm(freeSurface(NaN)))).toBe(true)
  })
})

describe('computeFrameGeometry — free mode', () => {
  const input = { anchor: { xPct: 0.5, yPct: 0.5 }, tilt: 0, widthCm: cm(12), heightCm: cm(18) }

  it('draws a 12×18 in frame at its true proportion of the wall', () => {
    const g = computeFrameGeometry(input, freeSurface(300))
    expect(g.width).toBeCloseTo(cm(12) * 4)
    expect(g.height).toBeCloseTo(cm(18) * 4)
    expect(g.width / g.height).toBeCloseTo(12 / 18) // proportions come from the SKU, never distorted
    expect(g.x).toBeCloseTo(600)
    expect(g.y).toBeCloseTo(450)
    expect(g.perspective).toBeUndefined()
  })

  it('makes the same frame look smaller on a wider wall', () => {
    const narrow = computeFrameGeometry(input, freeSurface(200))
    const wide = computeFrameGeometry(input, freeSurface(400))
    expect(wide.width).toBeCloseTo(narrow.width / 2)
    expect(wide.height).toBeCloseTo(narrow.height / 2)
  })

  it('keeps the anchor (centre) fixed regardless of size', () => {
    const small = computeFrameGeometry({ ...input, widthCm: cm(8), heightCm: cm(10) }, freeSurface())
    const big = computeFrameGeometry({ ...input, widthCm: cm(24), heightCm: cm(36) }, freeSurface())
    expect(small.x).toBe(big.x)
    expect(small.y).toBe(big.y)
  })

  it('passes the layout tilt through as rotation', () => {
    expect(computeFrameGeometry({ ...input, tilt: -4 }, freeSurface()).rotation).toBe(-4)
  })

  it('round-trips a dragged position through anchorFromPixels', () => {
    const anchor = anchorFromPixels(300, 225, WALL)
    expect(anchor).toEqual({ xPct: 0.25, yPct: 0.25 })
    const g = computeFrameGeometry({ ...input, anchor }, freeSurface())
    expect(g.x).toBeCloseTo(300)
    expect(g.y).toBeCloseTo(225)
  })
})

describe('computeFrameGeometry — wall-surface mode', () => {
  const surface = (region: PerspectiveCorners): PlacementSurface => ({ wall: WALL, mode: 'wall-surface', region, wallWidthCm: 400 })
  const input = { anchor: { xPct: 0.5, yPct: 0.5 }, tilt: 0, widthCm: cm(12), heightCm: cm(18) }

  it('on a head-on rectangular region, behaves like free mode inside the region', () => {
    const g = computeFrameGeometry(input, surface(rectRegion))
    expect(g.x).toBeCloseTo(600)
    expect(g.y).toBeCloseTo(400)
    expect(g.width).toBeCloseTo(cm(12) * 2) // 800px / 400cm = 2 px/cm
    expect(g.rotation).toBeCloseTo(0)
    expect(g.perspective).toBeDefined()
    // A rectangle maps to an axis-aligned rectangle centred on the anchor.
    const p = g.perspective!
    expect(p.topLeft.x).toBeCloseTo(600 - g.width / 2)
    expect(p.bottomRight.y).toBeCloseTo(400 + g.height / 2)
  })

  it('keeps every corner inside the marked region under strong perspective', () => {
    const g = computeFrameGeometry(input, surface(angledRegion))
    const p = g.perspective!
    const xs = [p.topLeft.x, p.topRight.x, p.bottomRight.x, p.bottomLeft.x]
    const ys = [p.topLeft.y, p.topRight.y, p.bottomRight.y, p.bottomLeft.y]
    expect(Math.min(...xs)).toBeGreaterThan(150)
    expect(Math.max(...xs)).toBeLessThan(1000)
    expect(Math.min(...ys)).toBeGreaterThan(80)
    expect(Math.max(...ys)).toBeLessThan(820)
    xs.concat(ys).forEach((v) => expect(Number.isFinite(v)).toBe(true))
  })

  it('foreshortens toward the far edge: the same frame is smaller on the shorter side of the wall', () => {
    const near = computeFrameGeometry({ ...input, anchor: { xPct: 0.15, yPct: 0.5 } }, surface(angledRegion)).perspective!
    const far = computeFrameGeometry({ ...input, anchor: { xPct: 0.85, yPct: 0.5 } }, surface(angledRegion)).perspective!
    const heightAt = (q: PerspectiveCorners) => Math.hypot(q.bottomLeft.x - q.topLeft.x, q.bottomLeft.y - q.topLeft.y)
    expect(heightAt(far)).toBeLessThan(heightAt(near))
  })

  it('stays finite for a nearly-degenerate (sliver) region', () => {
    const sliver: PerspectiveCorners = {
      topLeft: { x: 100, y: 100 },
      topRight: { x: 1100, y: 100.5 },
      bottomRight: { x: 1100, y: 101 },
      bottomLeft: { x: 100, y: 100.6 },
    }
    const g = computeFrameGeometry(input, surface(sliver))
    for (const v of [g.x, g.y, g.width, g.height, g.rotation]) expect(Number.isFinite(v)).toBe(true)
  })

  it('stays finite for a fully collapsed region (all points equal)', () => {
    const dot: PerspectiveCorners = {
      topLeft: { x: 5, y: 5 },
      topRight: { x: 5, y: 5 },
      bottomRight: { x: 5, y: 5 },
      bottomLeft: { x: 5, y: 5 },
    }
    expect(() => computeFrameGeometry(input, surface(dot))).not.toThrow()
  })

  it('composes a layout tilt with the wall perspective', () => {
    const flat = computeFrameGeometry(input, surface(rectRegion))
    const tilted = computeFrameGeometry({ ...input, tilt: 4 }, surface(rectRegion))
    expect(tilted.rotation).toBeCloseTo(flat.rotation + 4, 1)
  })

  it('keeps a tilted frame a true rectangle in a non-square region (regression: it used to shear)', () => {
    // rectRegion is 800×600 px, so unit-x and unit-y span different pixel lengths.
    const g = computeFrameGeometry({ ...input, tilt: 8 }, surface(rectRegion))
    const p = g.perspective!
    const top = { x: p.topRight.x - p.topLeft.x, y: p.topRight.y - p.topLeft.y }
    const left = { x: p.bottomLeft.x - p.topLeft.x, y: p.bottomLeft.y - p.topLeft.y }
    expect(Math.hypot(top.x, top.y)).toBeCloseTo(g.width, 3)
    expect(Math.hypot(left.x, left.y)).toBeCloseTo(g.height, 3)
    expect(top.x * left.x + top.y * left.y).toBeCloseTo(0, 3) // edges stay perpendicular
    expect(g.rotation).toBeCloseTo(8, 6) // and the tilt is exactly what was asked for
  })

  it('keeps relative spacing between two frames consistent when the wall width changes', () => {
    const left = { ...input, anchor: { xPct: 0.3, yPct: 0.5 } }
    const right = { ...input, anchor: { xPct: 0.7, yPct: 0.5 } }
    const at = (w: number) => ({ ...surface(rectRegion), wallWidthCm: w })
    const gap400 = computeFrameGeometry(right, at(400)).x - computeFrameGeometry(left, at(400)).x
    const gap600 = computeFrameGeometry(right, at(600)).x - computeFrameGeometry(left, at(600)).x
    // Centres are anchored to the region, not to the scale, so they don't move.
    expect(gap600).toBeCloseTo(gap400)
  })
})
