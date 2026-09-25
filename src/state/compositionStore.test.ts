import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrameInstance } from '../types/frame'
import { makePhoto, makeWall, resetAllStores } from '../test/fixtures'
import { useCompositionStore } from './compositionStore'
import { useUIStore } from './uiStore'
import { findSku, getProduct } from '../domain/catalog'
import { resolveFrameStyle } from '../domain/frameStyle'
import { skuDimensionsCm, isSquareSku } from '../domain/sizing'
import { computeInnerOpening } from '../lib/frameGeometry'
import { LAYOUTS } from '../lib/layouts'

const store = () => useCompositionStore.getState()

/** A photo covers its opening iff its (rotated) bounding box reaches every edge. */
function expectPhotoCovers(frame: FrameInstance) {
  const photo = frame.photo!
  const opening = computeInnerOpening(frame.width, frame.height, resolveFrameStyle(frame.productId, frame.matId))
  const t = frame.photoTransform
  const rad = (t.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const boundW = (photo.width * cos + photo.height * sin) * t.scale
  const boundH = (photo.width * sin + photo.height * cos) * t.scale
  expect(boundW / 2 - Math.abs(t.offsetX)).toBeGreaterThanOrEqual(opening.width / 2 - 1e-6)
  expect(boundH / 2 - Math.abs(t.offsetY)).toBeGreaterThanOrEqual(opening.height / 2 - 1e-6)
}

beforeEach(() => {
  resetAllStores()
  vi.restoreAllMocks()
})

describe('setWall and layout → real products', () => {
  it('builds the default layout as a real, sellable frame', () => {
    store().setWall(makeWall())
    expect(store().frames).toHaveLength(1)
    const frame = store().frames[0]
    expect(getProduct(frame.productId).id).toBe(frame.productId)
    expect(findSku(frame.productId, frame.sizeId)).toBeDefined()
  })

  it('every layout yields frames whose proportions are exactly the catalog size (never distorted by the slot)', () => {
    store().setWall(makeWall(1600, 900)) // deliberately not the 4:3 the layouts were drawn against
    for (const layout of LAYOUTS) {
      store().applyLayout(layout.id)
      expect(store().frames).toHaveLength(layout.slots.length)
      for (const frame of store().frames) {
        const sku = findSku(frame.productId, frame.sizeId)!
        const dims = skuDimensionsCm(sku, isSquareSku(sku) ? 'portrait' : frame.orientation)
        expect(frame.width / frame.height).toBeCloseTo(dims.width / dims.height, 6)
      }
    }
  })

  it('draws frames at real-world scale from the wall width', () => {
    store().setWall(makeWall(1200, 900)) // default 300cm wide → 4 px/cm
    const frame = store().frames[0]
    const sku = findSku(frame.productId, frame.sizeId)!
    const dims = skuDimensionsCm(sku, frame.orientation)
    expect(frame.width).toBeCloseTo(dims.width * 4)
  })

  it('starts each new wall photo with a fresh scale, no marked wall and no history', () => {
    store().setWall(makeWall())
    store().setWallWidthCm(450)
    store().markWall()
    store().setWall(makeWall())
    expect(store().wallWidthCm).toBe(300)
    expect(store().placementMode).toBe('free')
    expect(store().wallRegion).toBeNull()
    expect(store().past).toHaveLength(0)
  })

  it('keeps already-placed photos when the wall photo is replaced', () => {
    store().setWall(makeWall())
    const photo = makePhoto()
    store().setFramePhoto(store().frames[0].id, photo)
    store().setWall(makeWall())
    expect(store().frames[0].photo?.assetId).toBe(photo.assetId)
  })
})

describe('applyLayout', () => {
  it('carries photos to the nearest new slot, one photo per slot', () => {
    store().setWall(makeWall())
    store().applyLayout('three-minimal')
    const photos = store().frames.map(() => makePhoto())
    store().frames.forEach((f, i) => store().setFramePhoto(f.id, photos[i]))
    store().applyLayout('two-horizontal')
    const carried = store().frames.map((f) => f.photo?.assetId)
    expect(carried.filter(Boolean)).toHaveLength(2)
    expect(new Set(carried).size).toBe(2)
  })

  it('leaves every carried crop still covering its (new) opening', () => {
    store().setWall(makeWall())
    store().applyLayout('six-family')
    store().frames.forEach((f) => store().setFramePhoto(f.id, makePhoto(3000, 2000)))
    for (const layout of ['nine-grid', 'single-hero', 'five-wedding', 'asymmetrical-gallery']) {
      store().applyLayout(layout)
      store().frames.filter((f) => f.photo).forEach(expectPhotoCovers)
    }
  })

  it('uses each layout’s default product until the customer picks one, then keeps theirs', () => {
    store().setWall(makeWall())
    store().applyLayout('two-horizontal')
    expect(store().frames[0].productId).toBe('walnut') // that layout's curated default
    store().configureFrames('all', { productId: 'gold' })
    store().applyLayout('three-minimal')
    expect(store().frames.every((f) => f.productId === 'gold')).toBe(true)
  })

  it('re-derives sizes from the new layout (the layout decides composition)', () => {
    store().setWall(makeWall())
    store().applyLayout('nine-grid')
    const nineArea = store().frames[0].width * store().frames[0].height
    store().applyLayout('single-hero')
    expect(store().frames[0].width * store().frames[0].height).toBeGreaterThan(nineArea)
  })

  it('records the choice without a wall, applying it once one arrives', () => {
    store().applyLayout('six-family')
    expect(store().activeLayoutId).toBe('six-family')
    store().setWall(makeWall())
    expect(store().frames).toHaveLength(6)
  })

  it('falls back safely for an unknown layout id', () => {
    store().setWall(makeWall())
    expect(() => store().applyLayout('does-not-exist')).not.toThrow()
    expect(store().frames.length).toBeGreaterThan(0)
  })
})

describe('configureFrames', () => {
  beforeEach(() => {
    store().setWall(makeWall())
    store().applyLayout('three-minimal')
  })

  it('changes one frame’s size and leaves the others alone', () => {
    const [a, b, c] = store().frames
    store().configureFrames(a.id, { sizeId: '24x36' })
    const [a2, b2, c2] = store().frames
    expect(a2.sizeId).toBe('24x36')
    expect(a2.width * a2.height).toBeGreaterThan(a.width * a.height)
    expect(b2).toBe(b)
    expect(c2).toBe(c)
  })

  it('keeps the frame’s centre when its size changes', () => {
    const before = store().frames[1]
    store().configureFrames(before.id, { sizeId: '20x30' })
    const after = store().frames[1]
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('applies to all frames, and records a whole-wall product choice', () => {
    store().configureFrames('all', { productId: 'dark-brown', sizeId: '16x24' })
    expect(store().frames.every((f) => f.productId === 'dark-brown' && f.sizeId === '16x24')).toBe(true)
    expect(store().activeProductId).toBe('dark-brown')
    expect(store().hasCustomProduct).toBe(true)
  })

  it('a single-frame product change does not count as a whole-wall choice', () => {
    store().configureFrames(store().frames[0].id, { productId: 'gold' })
    expect(store().hasCustomProduct).toBe(false)
  })

  it('switching to a product without a mat does not silently add a (paid) one', () => {
    const id = store().frames[0].id
    store().configureFrames(id, { productId: 'walnut' })
    expect(store().frames[0].matId).toBe('mat')
    store().configureFrames(id, { productId: 'matte-black' })
    expect(store().frames[0].matId).toBe('none')
  })

  it('lets the customer add a mat to a product that ships without one', () => {
    const id = store().frames[0].id
    store().configureFrames(id, { productId: 'matte-black' })
    store().configureFrames(id, { matId: 'mat' })
    expect(store().frames[0].matId).toBe('mat')
  })

  it('a mat toggle changes the opening but the photo still covers it', () => {
    const id = store().frames[0].id
    store().setFramePhoto(id, makePhoto(2400, 1600))
    store().configureFrames(id, { matId: 'none' })
    expectPhotoCovers(store().frames[0])
    store().configureFrames(id, { matId: 'mat' })
    expectPhotoCovers(store().frames[0])
  })

  it('rejects options the product does not offer, falling back to the default', () => {
    const id = store().frames[0].id
    store().configureFrames(id, { productId: 'not-a-product' })
    expect(getProduct(store().frames[0].productId).id).toBe(store().frames[0].productId)
  })

  it('maps a size the new product lacks to the nearest one it has', () => {
    const id = store().frames[0].id
    store().configureFrames(id, { sizeId: '17x25' })
    expect(findSku(store().frames[0].productId, store().frames[0].sizeId)).toBeDefined()
  })

  it('flipping orientation swaps the footprint but keeps the size (and price)', () => {
    const id = store().frames[0].id
    store().configureFrames(id, { sizeId: '12x18', orientation: 'portrait' })
    const portrait = store().frames[0]
    store().configureFrames(id, { orientation: 'landscape' })
    const landscape = store().frames[0]
    expect(landscape.sizeId).toBe(portrait.sizeId)
    expect(landscape.width).toBeCloseTo(portrait.height)
    expect(landscape.height).toBeCloseTo(portrait.width)
  })

  it('does nothing without a wall', () => {
    resetAllStores()
    expect(() => store().configureFrames('all', { sizeId: '8x10' })).not.toThrow()
    expect(store().frames).toHaveLength(0)
  })
})

describe('crop preservation', () => {
  it('keeps a photo covering across a run of size and style changes (landscape, portrait, square, extreme)', () => {
    const photos = [makePhoto(4000, 3000), makePhoto(3000, 4000), makePhoto(2000, 2000), makePhoto(9000, 700), makePhoto(400, 6000), makePhoto(320, 240)]
    for (const photo of photos) {
      resetAllStores()
      store().setWall(makeWall())
      const id = store().frames[0].id
      store().setFramePhoto(id, photo)
      for (const patch of [
        { sizeId: '24x36' },
        { productId: 'matte-black' },
        { orientation: 'landscape' as const },
        { sizeId: '8x10' },
        { matId: 'mat' as const },
        { productId: 'gold', sizeId: '12x12' },
      ]) {
        store().configureFrames(id, patch)
        expectPhotoCovers(store().frames[0])
      }
    }
  })

  it('keeps a zoomed/panned crop proportional when a frame gets bigger', () => {
    store().setWall(makeWall())
    const id = store().frames[0].id
    store().configureFrames(id, { sizeId: '12x18' })
    store().setFramePhoto(id, makePhoto(4000, 3000))
    const min = store().frames[0].photoTransform.scale
    store().updateFramePhotoTransform(id, { scale: min * 2, offsetX: 20, offsetY: -10 })
    const before = store().frames[0]
    store().configureFrames(id, { sizeId: '24x36' })
    const after = store().frames[0]
    expect(after.photoTransform.scale / after.width).toBeGreaterThan(0)
    // Zoom relative to "just covers" is preserved (was ~2× minimum).
    expectPhotoCovers(after)
    expect(after.photoTransform.scale).toBeGreaterThan(before.photoTransform.scale)
  })

  it('rotating a photo 90° keeps it covering', () => {
    store().setWall(makeWall())
    const id = store().frames[0].id
    store().setFramePhoto(id, makePhoto(4000, 1000))
    store().rotatePhoto90(id, 1)
    expect(store().frames[0].photoTransform.rotation).toBe(90)
    expectPhotoCovers(store().frames[0])
    store().rotatePhoto90(id, -1)
    store().rotatePhoto90(id, -1)
    expect(store().frames[0].photoTransform.rotation).toBe(270)
    expectPhotoCovers(store().frames[0])
  })

  it('zooming out below cover scale, or panning far out, is clamped (no gap can appear)', () => {
    store().setWall(makeWall())
    const id = store().frames[0].id
    store().setFramePhoto(id, makePhoto(3000, 2000))
    store().updateFramePhotoTransform(id, { scale: 0.0001, offsetX: 1e6, offsetY: -1e6 })
    expectPhotoCovers(store().frames[0])
  })

  it('auto-fit resets pan and zoom to the tight cover', () => {
    store().setWall(makeWall())
    const id = store().frames[0].id
    store().setFramePhoto(id, makePhoto(3000, 2000))
    const fit = store().frames[0].photoTransform
    store().updateFramePhotoTransform(id, { scale: fit.scale * 3, offsetX: 50, offsetY: 50 })
    store().autoFitPhoto(id)
    expect(store().frames[0].photoTransform).toEqual(fit)
  })
})

describe('undo / redo', () => {
  it('walks back and forth through several dependent operations', () => {
    store().setWall(makeWall())
    const initialLayout = store().activeLayoutId
    store().applyLayout('three-minimal') // 1
    const ids = store().frames.map((f) => f.id)
    store().setFramePhoto(store().frames[0].id, makePhoto()) // 2
    store().configureFrames(store().frames[0].id, { sizeId: '24x36' }) // 3
    store().setWallWidthCm(400) // 4
    store().markWall() // 5

    expect(store().placementMode).toBe('wall-surface')
    store().undo() // → before markWall
    expect(store().placementMode).toBe('free')
    expect(store().wallWidthCm).toBe(400)
    store().undo() // → before wall width
    expect(store().wallWidthCm).toBe(300)
    store().undo() // → before size change
    expect(store().frames[0].sizeId).not.toBe('24x36')
    expect(store().frames[0].photo).not.toBeNull()
    store().undo() // → before photo
    expect(store().frames[0].photo).toBeNull()
    store().undo() // → before layout
    expect(store().activeLayoutId).toBe(initialLayout)
    expect(store().frames.map((f) => f.id)).not.toEqual(ids)
    expect(store().past).toHaveLength(0)

    for (let i = 0; i < 5; i++) store().redo()
    expect(store().placementMode).toBe('wall-surface')
    expect(store().wallWidthCm).toBe(400)
    expect(store().frames[0].sizeId).toBe('24x36')
    expect(store().future).toHaveLength(0)
  })

  it('a new action after undo discards the redo branch', () => {
    store().setWall(makeWall())
    store().applyLayout('six-family')
    store().undo()
    expect(store().future).toHaveLength(1)
    store().applyLayout('nine-grid')
    expect(store().future).toHaveLength(0)
  })

  it('undo and redo with nothing to do are harmless', () => {
    store().setWall(makeWall())
    expect(() => {
      store().undo()
      store().redo()
    }).not.toThrow()
  })

  it('does not record continuous edits (photo pan/zoom, wall-corner drag) as history', () => {
    store().setWall(makeWall())
    store().setFramePhoto(store().frames[0].id, makePhoto())
    store().markWall()
    const depth = store().past.length
    for (let i = 0; i < 20; i++) {
      store().updateFramePhotoTransform(store().frames[0].id, { offsetX: i })
      store().updateWallRegionCorner('topLeft', { x: 100 + i, y: 100 })
    }
    expect(store().past).toHaveLength(depth)
  })

  it('caps history so memory cannot grow without bound', () => {
    store().setWall(makeWall())
    for (let i = 0; i < 80; i++) store().setWallWidthCm(200 + i)
    expect(store().past.length).toBeLessThanOrEqual(50)
  })

  it('clears the selection so it never points at a frame that no longer exists', () => {
    store().setWall(makeWall())
    store().applyLayout('three-minimal')
    useUIStore.getState().selectFrame(store().frames[0].id)
    store().applyLayout('single-hero')
    expect(useUIStore.getState().selectedFrameId).toBeNull()
  })
})

describe('wall marking and scale', () => {
  it('marking the wall maps every frame into it with a perspective quad', () => {
    store().setWall(makeWall())
    store().applyLayout('six-family')
    store().markWall()
    expect(store().placementMode).toBe('wall-surface')
    expect(store().wallRegion).not.toBeNull()
    expect(store().frames.every((f) => f.perspective !== undefined)).toBe(true)
  })

  it('dragging a wall corner live-updates the frames without changing their identity or photos', () => {
    store().setWall(makeWall())
    store().applyLayout('three-minimal')
    const photo = makePhoto()
    store().setFramePhoto(store().frames[0].id, photo)
    store().markWall()
    const ids = store().frames.map((f) => f.id)
    const before = store().frames[0].perspective!.topLeft.x
    store().updateWallRegionCorner('topLeft', { x: 40, y: 60 })
    expect(store().frames.map((f) => f.id)).toEqual(ids)
    expect(store().frames[0].photo?.assetId).toBe(photo.assetId)
    expect(store().frames[0].perspective!.topLeft.x).not.toBe(before)
    expectPhotoCovers(store().frames[0])
  })

  it('clearing the wall returns to whole-photo placement', () => {
    store().setWall(makeWall())
    store().markWall()
    store().clearWallRegion()
    expect(store().placementMode).toBe('free')
    expect(store().wallRegion).toBeNull()
    expect(store().frames.every((f) => f.perspective === undefined)).toBe(true)
  })

  it('a wider wall makes the same frames smaller and keeps them covered', () => {
    store().setWall(makeWall())
    store().setFramePhoto(store().frames[0].id, makePhoto())
    const before = store().frames[0].width
    store().setWallWidthCm(600)
    expect(store().frames[0].width).toBeCloseTo(before / 2)
    expectPhotoCovers(store().frames[0])
  })

  it('never stores an invalid wall width', () => {
    store().setWall(makeWall())
    store().setWallWidthCm(-5)
    expect(store().wallWidthCm).toBe(300)
    store().setWallWidthCm(NaN)
    expect(store().wallWidthCm).toBe(300)
    store().setWallWidthCm(1e9)
    expect(store().wallWidthCm).toBe(300)
  })

  it('setting the same width is not a history step', () => {
    store().setWall(makeWall())
    store().setWallWidthCm(300)
    expect(store().past).toHaveLength(0)
  })
})

describe('frames: move, add, remove', () => {
  it('dragging a frame in free mode updates its anchor (so it survives later size changes)', () => {
    store().setWall(makeWall(1200, 900))
    const id = store().frames[0].id
    store().updateFrameTransform(id, { x: 300, y: 225 })
    expect(store().frames[0].anchor).toEqual({ xPct: 0.25, yPct: 0.25 })
    store().configureFrames(id, { sizeId: '24x36' })
    expect(store().frames[0].x).toBeCloseTo(300)
    expect(store().frames[0].y).toBeCloseTo(225)
  })

  it('a rotation becomes the frame’s tilt', () => {
    store().setWall(makeWall())
    const id = store().frames[0].id
    store().updateFrameTransform(id, { rotation: 7 })
    expect(store().frames[0].tilt).toBe(7)
    expect(store().frames[0].rotation).toBe(7)
  })

  it('adds a real, priced frame and can remove it again', () => {
    store().setWall(makeWall())
    store().addFrame()
    expect(store().frames).toHaveLength(2)
    const added = store().frames[1]
    expect(findSku(added.productId, added.sizeId)).toBeDefined()
    store().removeFrame(added.id)
    expect(store().frames).toHaveLength(1)
  })

  it('an added frame follows the wall region like any other', () => {
    store().setWall(makeWall())
    store().markWall()
    store().addFrame()
    expect(store().frames[1].perspective).toBeDefined()
  })

  it('refuses to add frames beyond the cap', () => {
    store().setWall(makeWall())
    for (let i = 0; i < 40; i++) store().addFrame()
    expect(store().frames.length).toBeLessThanOrEqual(24)
  })
})

describe('object-URL lifecycle', () => {
  const revoked = () => vi.mocked(URL.revokeObjectURL).mock.calls.map((c) => c[0])

  beforeEach(() => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('keeps a replaced photo alive while undo can still bring it back', () => {
    store().setWall(makeWall())
    const first = makePhoto()
    const second = makePhoto()
    const id = store().frames[0].id
    store().setFramePhoto(id, first)
    store().setFramePhoto(id, second)
    expect(revoked()).not.toContain(first.src)
    store().undo()
    expect(store().frames[0].photo?.src).toBe(first.src) // and it is still a valid URL
  })

  it('releases a photo once history has moved past it', () => {
    store().setWall(makeWall())
    const doomed = makePhoto()
    const id = store().frames[0].id
    store().setFramePhoto(id, doomed)
    store().setFramePhoto(id, makePhoto())
    for (let i = 0; i < 60; i++) store().setWallWidthCm(200 + i) // pushes the old state out of the 50-step window
    expect(revoked()).toContain(doomed.src)
  })

  it('never revokes a photo that is still displayed', () => {
    store().setWall(makeWall())
    const shown = makePhoto()
    store().setFramePhoto(store().frames[0].id, shown)
    for (let i = 0; i < 60; i++) store().setWallWidthCm(200 + i)
    expect(revoked()).not.toContain(shown.src)
  })

  it('releases the old wall when it is replaced', () => {
    const old = makeWall()
    store().setWall(old)
    store().setWall(makeWall())
    expect(revoked()).toContain(old.src)
  })

  it('a removed frame’s photo is released after history moves on, but not before', () => {
    store().setWall(makeWall())
    store().addFrame()
    const photo = makePhoto()
    const id = store().frames[1].id
    store().setFramePhoto(id, photo)
    store().removeFrame(id)
    expect(revoked()).not.toContain(photo.src) // undo could restore it
    for (let i = 0; i < 60; i++) store().setWallWidthCm(200 + i)
    expect(revoked()).toContain(photo.src)
  })

  it('starting over releases everything', () => {
    const wall = makeWall()
    store().setWall(wall)
    const photo = makePhoto()
    store().setFramePhoto(store().frames[0].id, photo)
    store().resetComposition()
    expect(revoked()).toEqual(expect.arrayContaining([wall.src, photo.src]))
  })

  it('panning/zooming a photo does not trigger any lifecycle work', () => {
    store().setWall(makeWall())
    store().setFramePhoto(store().frames[0].id, makePhoto())
    const calls = revoked().length
    for (let i = 0; i < 30; i++) store().updateFramePhotoTransform(store().frames[0].id, { offsetX: i })
    expect(revoked()).toHaveLength(calls)
  })
})

describe('restoreComposition', () => {
  it('rebuilds geometry from the saved design, and starts with clean history', () => {
    store().setWall(makeWall())
    store().applyLayout('three-minimal')
    const saved = store().frames
    const wall = store().wall!
    resetAllStores()
    store().restoreComposition({
      wall,
      wallWidthCm: 300,
      frames: saved,
      activeLayoutId: 'three-minimal',
      activeProductId: 'natural-oak',
      hasCustomProduct: false,
      placementMode: 'free',
      wallRegion: null,
    })
    expect(store().frames).toHaveLength(3)
    expect(store().past).toHaveLength(0)
    expect(store().frames[0].width).toBeCloseTo(saved[0].width)
  })

  it('repairs a stale size id and an invalid wall width', () => {
    store().setWall(makeWall())
    const saved = store().frames.map((f) => ({ ...f, sizeId: '99x99' }))
    const wall = store().wall!
    resetAllStores()
    store().restoreComposition({
      wall,
      wallWidthCm: NaN,
      frames: saved,
      activeLayoutId: 'nope',
      activeProductId: 'nope',
      hasCustomProduct: true,
      placementMode: 'free',
      wallRegion: null,
    })
    expect(findSku(store().frames[0].productId, store().frames[0].sizeId)).toBeDefined()
    expect(store().wallWidthCm).toBe(300)
    expect(getProduct(store().activeProductId).id).toBe(store().activeProductId)
  })
})
