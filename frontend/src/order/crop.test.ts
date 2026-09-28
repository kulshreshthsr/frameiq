import { describe, expect, it } from 'vitest'
import { computeCropRect, quarterTurns } from './crop'

const T = (over: Partial<{ offsetX: number; offsetY: number; scale: number; rotation: number }> = {}) => ({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0, ...over })

describe('quarterTurns', () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [360, 0],
    [-90, 270],
    [450, 90],
    [89.9, 90], // snapped: the editor only ever produces quarter turns
    [-0.4, 0],
  ])('%s° → %s°', (input, expected) => {
    expect(quarterTurns(input)).toBe(expected)
  })
})

describe('computeCropRect', () => {
  const opening = { width: 100, height: 100 }
  const photo = { width: 1000, height: 500 }

  it('is the whole photo when the photo exactly fills the opening', () => {
    const crop = computeCropRect({ width: 200, height: 100 }, { width: 200, height: 100 }, T())
    expect(crop).toEqual({ x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 })
  })

  it('shows the centre of a wide photo in a square opening', () => {
    // Photo drawn at 200×100 on screen (scale 0.2): a 100×100 opening sees the middle half.
    expect(computeCropRect(opening, photo, T({ scale: 0.2 }))).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1, rotationDeg: 0 })
  })

  it('zooming in narrows the crop', () => {
    const zoomed = computeCropRect(opening, photo, T({ scale: 0.4 }))
    expect(zoomed.width).toBeCloseTo(0.25, 6)
    expect(zoomed.height).toBeCloseTo(0.5, 6)
    expect(zoomed.x).toBeCloseTo(0.375, 6)
  })

  it('panning the photo right reveals more of its left side', () => {
    const crop = computeCropRect(opening, photo, T({ scale: 0.2, offsetX: 20 }))
    expect(crop.x).toBeCloseTo(0.15, 6)
    expect(crop.x + crop.width).toBeCloseTo(0.65, 6)
  })

  it('a quarter turn crops in the photo’s own (un-rotated) coordinates', () => {
    const crop = computeCropRect(opening, photo, T({ scale: 0.2, rotation: 90 }))
    expect(crop.rotationDeg).toBe(90)
    // Rotated, the photo's long side runs up the frame: the opening sees the middle half of it.
    expect(crop).toMatchObject({ x: 0.25, width: 0.5, y: 0, height: 1 })
  })

  it('never reaches outside the photo', () => {
    const crop = computeCropRect(opening, photo, T({ scale: 0.05, offsetX: 900 }))
    for (const value of [crop.x, crop.y, crop.x + crop.width, crop.y + crop.height]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('is independent of the photo’s resolution — a higher-res copy gets the same crop', () => {
    const low = computeCropRect(opening, { width: 1000, height: 500 }, T({ scale: 0.2, offsetX: 12 }))
    // The same picture at 4× the pixels is drawn at a quarter of the scale.
    const high = computeCropRect(opening, { width: 4000, height: 2000 }, T({ scale: 0.05, offsetX: 12 }))
    expect(high).toEqual(low)
  })
})
