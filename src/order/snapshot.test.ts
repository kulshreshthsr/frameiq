import { beforeEach, describe, expect, it } from 'vitest'
import { canonicalJson } from '../../shared/canonical'
import { computeOrderTotals } from '../../shared/pricing'
import { currentCatalog } from '../domain/catalog'
import { useCompositionStore } from '../state/compositionStore'
import { makePhoto, makeWall, resetAllStores } from '../test/fixtures'
import { buildDesignSnapshot, isValidSnapshot, sha256Hex, snapshotDigest } from './snapshot'

const store = () => useCompositionStore.getState()

function designTwoFrames(size = '8x10') {
  store().setWall(makeWall())
  store().applyLayout('two-horizontal')
  store().configureFrames('all', { productId: 'walnut', sizeId: size })
  for (const frame of store().frames) store().setFramePhoto(frame.id, makePhoto(1600, 1200, 2))
}

function build(now = new Date('2026-09-26T10:00:00Z')) {
  const c = store()
  return buildDesignSnapshot({
    wall: c.wall!,
    wallWidthCm: c.wallWidthCm,
    placementMode: c.placementMode,
    wallRegion: c.wallRegion,
    layoutId: c.activeLayoutId,
    frames: c.frames,
    catalog: currentCatalog(),
    now,
    appVersion: '9.9.9',
  })
}

beforeEach(() => resetAllStores())

describe('buildDesignSnapshot', () => {
  it('produces a document the server’s schema accepts', () => {
    designTwoFrames()
    expect(isValidSnapshot(build())).toBe(true)
  })

  it('records what was ordered, at what price, with version metadata', () => {
    designTwoFrames()
    const snapshot = build()
    expect(snapshot.app).toMatchObject({ name: 'framengine', version: '9.9.9', catalogVersion: currentCatalog().version })
    expect(snapshot.createdAt).toBe('2026-09-26T10:00:00.000Z')
    expect(snapshot.layoutId).toBe('two-horizontal')
    expect(snapshot.frames).toHaveLength(2)
    expect(snapshot.frames.map((f) => f.number)).toEqual([1, 2])
    expect(snapshot.frames[0]).toMatchObject({ productId: 'walnut', sizeId: '8x10', sizeIn: { width: 8, height: 10 } })
    expect(snapshot.items).toEqual([expect.objectContaining({ productId: 'walnut', sizeId: '8x10', quantity: 2 })])
    const totals = computeOrderTotals(currentCatalog(), store().frames)
    expect(snapshot.pricing).toEqual({ currency: 'INR', subtotalMinor: totals.subtotalMinor, deliveryFeeMinor: totals.deliveryFeeMinor, totalMinor: totals.totalMinor })
    expect(snapshot.pricing.totalMinor).toBe(114700)
  })

  it('gives each photo a screen-independent crop and its source-image reference', () => {
    designTwoFrames()
    const photo = build().frames[0].photo!
    expect(photo.asset.sourceWidth).toBe(3200) // the ORIGINAL's size, not the editor copy's
    expect(photo.crop.width).toBeGreaterThan(0)
    expect(photo.crop.width).toBeLessThanOrEqual(1)
    expect([0, 90, 180, 270]).toContain(photo.crop.rotationDeg)
  })

  it('is not a blind store dump: no object URLs or UI state leak in', () => {
    designTwoFrames()
    const text = JSON.stringify(build())
    expect(text).not.toContain('blob:')
    expect(text).not.toContain('"past"')
    expect(text).not.toContain('"src"')
  })

  it('is deterministic: the same design gives the same digest, whenever it is built', async () => {
    designTwoFrames()
    const a = await snapshotDigest(build(new Date('2026-01-01T00:00:00Z')))
    const b = await snapshotDigest(build(new Date('2030-06-01T12:34:56Z')))
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    const first = canonicalJson({ ...build(), createdAt: undefined })
    expect(canonicalJson({ ...build(), createdAt: undefined })).toBe(first)
  })

  it('any change to the design changes the digest', async () => {
    designTwoFrames('8x10')
    const before = await snapshotDigest(build())
    store().configureFrames('all', { sizeId: '12x18' })
    expect(await snapshotDigest(build())).not.toBe(before)
  })

  it('matches the digest the server computes (Node’s crypto)', async () => {
    designTwoFrames()
    const snapshot = build()
    const { createHash } = await import('node:crypto')
    const server = createHash('sha256')
      .update(canonicalJson({ ...snapshot, createdAt: undefined }))
      .digest('hex')
    expect(await snapshotDigest(snapshot)).toBe(server)
  })

  it('refuses to describe an order with nothing in it', () => {
    store().setWall(makeWall())
    store().applyLayout('two-horizontal')
    for (const frame of [...store().frames]) store().removeFrame(frame.id)
    expect(() => build()).toThrow(/no frames/i)
  })

  it('refuses frames the catalog no longer sells', () => {
    designTwoFrames()
    const c = store()
    const withdrawn = { ...currentCatalog(), products: currentCatalog().products.filter((p) => p.id !== 'walnut') }
    expect(() =>
      buildDesignSnapshot({ wall: c.wall!, wallWidthCm: c.wallWidthCm, placementMode: c.placementMode, wallRegion: c.wallRegion, layoutId: c.activeLayoutId, frames: c.frames, catalog: withdrawn, now: new Date(), appVersion: '1' }),
    ).toThrow(/not available/i)
  })
})

describe('sha256Hex', () => {
  it('matches the well-known digest of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
