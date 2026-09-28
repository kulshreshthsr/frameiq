import { describe, expect, it } from 'vitest'
import type { FrameStyleConfig, PhotoTransform } from '../types/frame'
import { getFrameStyle } from './frameStyles'
import {
  LIGHT_SHADOW_SKEW,
  clampPhotoPan,
  computeContactShadowLayers,
  computeInnerOpening,
  coverScaleForRotation,
  rescalePhotoTransform,
} from './frameGeometry'

const oak = getFrameStyle('natural-oak')
const black = getFrameStyle('matte-black')

/** True if a photo with this transform fully covers an opening (no gap at any edge). */
function covers(
  transform: PhotoTransform,
  opening: { width: number; height: number },
  photo: { width: number; height: number },
): boolean {
  const rad = (transform.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const boundW = (photo.width * cos + photo.height * sin) * transform.scale
  const boundH = (photo.width * sin + photo.height * cos) * transform.scale
  const eps = 1e-6
  return (
    boundW / 2 - Math.abs(transform.offsetX) >= opening.width / 2 - eps &&
    boundH / 2 - Math.abs(transform.offsetY) >= opening.height / 2 - eps
  )
}

const PHOTOS = {
  landscape: { width: 4000, height: 3000 },
  portrait: { width: 3000, height: 4000 },
  square: { width: 2000, height: 2000 },
  panorama: { width: 12000, height: 1000 },
  tallStrip: { width: 500, height: 6000 },
  tiny: { width: 64, height: 48 },
  huge: { width: 24000, height: 18000 },
}

describe('computeInnerOpening', () => {
  it('shrinks by moulding + mat on every side', () => {
    const o = computeInnerOpening(300, 400, oak)
    expect(o.width).toBeCloseTo(300 - 2 * (o.outerThickness + o.innerThickness))
    expect(o.height).toBeCloseTo(400 - 2 * (o.outerThickness + o.innerThickness))
  })

  it('has no mat thickness for a style without a mat', () => {
    expect(computeInnerOpening(300, 400, black).innerThickness).toBe(0)
  })

  it('never returns a non-positive opening, even for a tiny frame', () => {
    const o = computeInnerOpening(4, 4, oak)
    expect(o.width).toBeGreaterThanOrEqual(1)
    expect(o.height).toBeGreaterThanOrEqual(1)
  })

  it('a removed mat enlarges the opening', () => {
    const withMat = computeInnerOpening(300, 400, oak)
    const noMat = computeInnerOpening(300, 400, { ...oak, matColor: null, innerThicknessRatio: 0 })
    expect(noMat.width).toBeGreaterThan(withMat.width)
  })
})

describe('coverScaleForRotation', () => {
  it('matches the plain cover scale at 0° and 180°', () => {
    expect(coverScaleForRotation(300, 200, 1000, 1000, 0)).toBeCloseTo(0.3)
    expect(coverScaleForRotation(300, 200, 1000, 1000, 180)).toBeCloseTo(0.3)
  })

  it('transposes the photo at 90° and 270°', () => {
    // 400x200 photo in a 100x300 opening: upright needs 1.5 (height-limited); turned 90° the photo is 200 wide × 400 tall → 0.75.
    expect(coverScaleForRotation(100, 300, 400, 200, 0)).toBeCloseTo(1.5)
    expect(coverScaleForRotation(100, 300, 400, 200, 90)).toBeCloseTo(0.75)
    expect(coverScaleForRotation(100, 300, 400, 200, 270)).toBeCloseTo(0.75)
  })

  it('normalizes negative and >360 angles', () => {
    expect(coverScaleForRotation(100, 300, 400, 200, -90)).toBeCloseTo(coverScaleForRotation(100, 300, 400, 200, 90))
    expect(coverScaleForRotation(100, 300, 400, 200, 450)).toBeCloseTo(coverScaleForRotation(100, 300, 400, 200, 90))
  })
})

describe('clampPhotoPan', () => {
  const opening = { width: 200, height: 300 }

  it('allows no panning when the photo exactly covers the opening', () => {
    const scale = coverScaleForRotation(opening.width, opening.height, 1000, 1000, 0)
    // 1000² at 0.3 = 300² covers 200×300 with slack only in x.
    const r = clampPhotoPan(500, 500, scale, 0, opening.width, opening.height, 1000, 1000)
    expect(r.offsetY).toBe(0)
    expect(Math.abs(r.offsetX)).toBeCloseTo(50)
  })

  it('clamps symmetrically on both sides', () => {
    const r = clampPhotoPan(-9999, 9999, 0.5, 0, opening.width, opening.height, 1000, 1000)
    expect(r.offsetX).toBeCloseTo(-150)
    expect(r.offsetY).toBeCloseTo(100)
  })

  it('leaves an in-range offset untouched', () => {
    expect(clampPhotoPan(10, -20, 0.5, 0, opening.width, opening.height, 1000, 1000)).toEqual({ offsetX: 10, offsetY: -20 })
  })

  it('uses the rotated bounding box for in-between angles', () => {
    // A square photo's bounding box is widest at 45° (√2 × its side), so
    // there is more room to pan than when it is upright.
    const at0 = clampPhotoPan(9999, 0, 0.5, 0, 200, 300, 400, 400)
    const at45 = clampPhotoPan(9999, 0, 0.5, 45, 200, 300, 400, 400)
    expect(at0.offsetX).toBeCloseTo(0)
    expect(at45.offsetX).toBeCloseTo((400 * Math.SQRT2 * 0.5 - 200) / 2)
  })

  it.each(Object.entries(PHOTOS))('never produces a gap for a %s photo at any rotation', (_name, photo) => {
    for (const rotation of [0, 90, 180, 270]) {
      const scale = coverScaleForRotation(opening.width, opening.height, photo.width, photo.height, rotation) * 1.3
      const r = clampPhotoPan(1e9, -1e9, scale, rotation, opening.width, opening.height, photo.width, photo.height)
      expect(covers({ ...r, scale, rotation }, opening, photo)).toBe(true)
    }
  })
})

describe('rescalePhotoTransform', () => {
  const start = (photo: { width: number; height: number }, inner: { width: number; height: number }): PhotoTransform => ({
    offsetX: 0,
    offsetY: 0,
    scale: coverScaleForRotation(inner.width, inner.height, photo.width, photo.height, 0),
    rotation: 0,
  })

  it.each(Object.entries(PHOTOS))('keeps a %s photo covering when the opening changes shape', (_name, photo) => {
    const oldInner = { width: 200, height: 300 }
    const newInner = { width: 500, height: 320 } // different aspect ratio entirely
    const next = rescalePhotoTransform(start(photo, oldInner), oldInner, newInner, photo)
    expect(covers(next, newInner, photo)).toBe(true)
  })

  it('keeps a customer’s zoom proportional when the opening grows uniformly', () => {
    const photo = PHOTOS.landscape
    const oldInner = { width: 200, height: 300 }
    const newInner = { width: 400, height: 600 }
    const zoomed: PhotoTransform = { offsetX: 12, offsetY: -8, scale: start(photo, oldInner).scale * 2, rotation: 0 }
    const next = rescalePhotoTransform(zoomed, oldInner, newInner, photo)
    expect(next.scale).toBeCloseTo(zoomed.scale * 2, 6)
    expect(next.offsetX).toBeCloseTo(24, 6)
    expect(next.offsetY).toBeCloseTo(-16, 6)
  })

  it('never lets a shrinking opening push the photo below cover scale', () => {
    const photo = PHOTOS.portrait
    const oldInner = { width: 400, height: 600 }
    const newInner = { width: 100, height: 150 }
    const next = rescalePhotoTransform(start(photo, oldInner), oldInner, newInner, photo)
    expect(next.scale).toBeGreaterThanOrEqual(coverScaleForRotation(newInner.width, newInner.height, photo.width, photo.height, 0) - 1e-9)
  })

  it('preserves rotation and stays covering for a rotated photo', () => {
    const photo = PHOTOS.landscape
    const oldInner = { width: 200, height: 300 }
    const newInner = { width: 260, height: 260 }
    const rotated: PhotoTransform = {
      offsetX: 0,
      offsetY: 0,
      scale: coverScaleForRotation(oldInner.width, oldInner.height, photo.width, photo.height, 90),
      rotation: 90,
    }
    const next = rescalePhotoTransform(rotated, oldInner, newInner, photo)
    expect(next.rotation).toBe(90)
    expect(covers(next, newInner, photo)).toBe(true)
  })

  it('clamps a stale, out-of-range offset into the new slack', () => {
    const photo = PHOTOS.square
    const oldInner = { width: 300, height: 300 }
    const newInner = { width: 300, height: 300 }
    const wild: PhotoTransform = { offsetX: 5000, offsetY: -5000, scale: 0.2, rotation: 0 }
    const next = rescalePhotoTransform(wild, oldInner, newInner, photo)
    expect(covers(next, newInner, photo)).toBe(true)
  })

  it('returns the transform unchanged when the old scale is degenerate', () => {
    const t: PhotoTransform = { offsetX: 1, offsetY: 2, scale: 3, rotation: 0 }
    expect(rescalePhotoTransform(t, { width: 0, height: 0 }, { width: 100, height: 100 }, PHOTOS.square)).toEqual(t)
  })

  it('survives a very small photo in a large opening (heavy upscaling)', () => {
    const photo = PHOTOS.tiny
    const oldInner = { width: 100, height: 100 }
    const newInner = { width: 900, height: 900 }
    const next = rescalePhotoTransform(start(photo, oldInner), oldInner, newInner, photo)
    expect(Number.isFinite(next.scale)).toBe(true)
    expect(covers(next, newInner, photo)).toBe(true)
  })
})

describe('contact shadow / bevel light direction', () => {
  it('falls down and to the right, matching a top-left light', () => {
    const { tight, soft } = computeContactShadowLayers(400, oak)
    expect(tight.offsetY).toBeGreaterThan(0)
    expect(tight.offsetX).toBeGreaterThan(0)
    expect(soft.offsetY).toBeGreaterThan(0)
    expect(soft.offsetX).toBeGreaterThan(0)
  })

  it('uses one shared skew for both passes, so they cannot disagree', () => {
    const { tight, soft } = computeContactShadowLayers(400, oak)
    expect(tight.offsetX / tight.offsetY).toBeCloseTo(LIGHT_SHADOW_SKEW)
    expect(soft.offsetX / soft.offsetY).toBeCloseTo(LIGHT_SHADOW_SKEW)
  })

  it('leans more down than sideways (the bevel is lit mostly from above)', () => {
    expect(LIGHT_SHADOW_SKEW).toBeGreaterThan(0)
    expect(LIGHT_SHADOW_SKEW).toBeLessThan(1)
  })

  it('softer pass is wider and fainter than the tight pass', () => {
    const { tight, soft } = computeContactShadowLayers(400, oak)
    expect(soft.blur).toBeGreaterThan(tight.blur)
    expect(soft.opacity).toBeLessThan(tight.opacity)
  })

  it('a brighter wall nudges opacity within a tight band, never relights', () => {
    const dim = computeContactShadowLayers(400, oak, 0.65)
    const bright = computeContactShadowLayers(400, oak, 1.35)
    expect(bright.tight.opacity).toBeGreaterThanOrEqual(dim.tight.opacity)
    expect(bright.tight.opacity / dim.tight.opacity).toBeLessThan(1.6)
  })

  it('stays within sane bounds for extreme frame sizes and styles', () => {
    const extremeStyle: FrameStyleConfig = { ...oak, shadowStrength: 50, physicalThicknessRatio: 5 }
    for (const dim of [1, 40, 400, 40000]) {
      const layers = computeContactShadowLayers(dim, extremeStyle, 100)
      for (const layer of [layers.tight, layers.soft]) {
        expect(layer.blur).toBeLessThanOrEqual(40)
        expect(layer.opacity).toBeLessThanOrEqual(0.5)
        expect(Number.isFinite(layer.offsetX)).toBe(true)
      }
    }
  })
})
