import { describe, expect, it } from 'vitest'
import { currentCatalog, findSku, getProduct } from './catalog'
import {
  CM_PER_INCH,
  DEFAULT_WALL_WIDTH_CM,
  chooseSizeForSlot,
  formatSkuCm,
  formatSkuInches,
  isValidWallWidthCm,
  nearestAvailableSku,
  sanitizeWallWidthCm,
  skuDimensionsCm,
} from './sizing'

const walnut = getProduct('walnut')

describe('skuDimensionsCm', () => {
  it('converts a portrait SKU to centimetres', () => {
    const dims = skuDimensionsCm(findSku('walnut', '12x18')!, 'portrait')
    expect(dims.width).toBeCloseTo(12 * CM_PER_INCH)
    expect(dims.height).toBeCloseTo(18 * CM_PER_INCH)
  })

  it('swaps width and height for landscape', () => {
    const dims = skuDimensionsCm(findSku('walnut', '12x18')!, 'landscape')
    expect(dims.width).toBeCloseTo(18 * CM_PER_INCH)
    expect(dims.height).toBeCloseTo(12 * CM_PER_INCH)
  })

  it('formats sizes for customers', () => {
    const sku = findSku('walnut', '12x18')!
    expect(formatSkuInches(sku)).toBe('12 × 18 in')
    expect(formatSkuInches(sku, 'landscape')).toBe('18 × 12 in')
    expect(formatSkuCm(sku)).toBe('30 × 46 cm')
  })
})

describe('wall width', () => {
  it('accepts a plausible width and rejects nonsense', () => {
    expect(isValidWallWidthCm(300)).toBe(true)
    expect(isValidWallWidthCm(0)).toBe(false)
    expect(isValidWallWidthCm(-50)).toBe(false)
    expect(isValidWallWidthCm(5)).toBe(false)
    expect(isValidWallWidthCm(100000)).toBe(false)
    expect(isValidWallWidthCm(NaN)).toBe(false)
    expect(isValidWallWidthCm(Infinity)).toBe(false)
  })

  it('falls back to the default rather than ever holding an invalid value', () => {
    expect(sanitizeWallWidthCm(NaN)).toBe(DEFAULT_WALL_WIDTH_CM)
    expect(sanitizeWallWidthCm(-1)).toBe(DEFAULT_WALL_WIDTH_CM)
    expect(sanitizeWallWidthCm(250)).toBe(250)
  })
})

describe('chooseSizeForSlot', () => {
  it('picks the size that matches a slot of that physical size', () => {
    const choice = chooseSizeForSlot(walnut, 12 * CM_PER_INCH, 18 * CM_PER_INCH)
    expect(choice.sku.id).toBe('12x18')
    expect(choice.orientation).toBe('portrait')
  })

  it('picks landscape for a wide slot', () => {
    const choice = chooseSizeForSlot(walnut, 18 * CM_PER_INCH, 12 * CM_PER_INCH)
    expect(choice.sku.id).toBe('12x18')
    expect(choice.orientation).toBe('landscape')
  })

  it('picks a square size for a square slot', () => {
    const choice = chooseSizeForSlot(walnut, 30, 30)
    expect(choice.sku.id).toBe('12x12')
  })

  it('never invents a size: the result is always one the product sells', () => {
    for (const product of currentCatalog().products) {
      for (const [w, h] of [[5, 5], [30, 46], [200, 300], [1, 1000], [1000, 1]]) {
        const { sku } = chooseSizeForSlot(product, w, h)
        expect(product.sizes.map((s) => s.id)).toContain(sku.id)
      }
    }
  })

  it('is symmetric in over- and under-sizing (log-ratio, not absolute difference)', () => {
    // A product that sells only 12x18 (30.5cm wide) and 16x24 (40.6cm wide):
    // in log space the boundary is the geometric mean of the two widths, not
    // the arithmetic midpoint.
    const twoSizes = { ...walnut, sizes: walnut.sizes.filter((s) => s.id === '12x18' || s.id === '16x24') }
    const small = 12 * CM_PER_INCH
    const big = 16 * CM_PER_INCH
    const boundary = Math.sqrt(small * big)
    expect(chooseSizeForSlot(twoSizes, boundary * 0.97, boundary * 1.5 * 0.97).sku.id).toBe('12x18')
    expect(chooseSizeForSlot(twoSizes, boundary * 1.03, boundary * 1.5 * 1.03).sku.id).toBe('16x24')
    // The arithmetic midpoint (35.6cm) is above the geometric one (34.9cm),
    // so a slot at 35.2cm is already closer to 16x24 in ratio terms.
    expect(chooseSizeForSlot(twoSizes, 35.2, 35.2 * 1.5).sku.id).toBe('16x24')
  })

  it('handles degenerate slot sizes without throwing or producing NaN', () => {
    expect(() => chooseSizeForSlot(walnut, 0, 0)).not.toThrow()
    expect(() => chooseSizeForSlot(walnut, -10, 5)).not.toThrow()
  })
})

describe('nearestAvailableSku', () => {
  it('returns the exact size when offered', () => {
    expect(nearestAvailableSku(walnut, '16x24').id).toBe('16x24')
  })

  it('maps an unknown size id to the closest by area', () => {
    expect(nearestAvailableSku(walnut, '17x25').id).toBe('16x24')
    expect(nearestAvailableSku(walnut, '40x60').id).toBe('24x36')
  })

  it('falls back to the first size for an unparseable id', () => {
    expect(nearestAvailableSku(walnut, 'banana').id).toBe(walnut.sizes[0].id)
  })
})
