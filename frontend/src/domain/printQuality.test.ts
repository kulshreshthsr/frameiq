import { describe, expect, it } from 'vitest'
import { getProduct, findSku } from './catalog'
import { PPI_FAIR, PPI_GOOD, assessPrintQuality, effectivePpi, largestSharpSku } from './printQuality'

describe('effectivePpi', () => {
  it('is source pixels per inch of print', () => {
    // 3600px photo filling a 12in-wide frame drawn at 1:1 → 300 ppi.
    expect(
      effectivePpi({ frameWidthPx: 1200, frameWidthIn: 12, photoScale: 1200 / 3600, workingWidth: 3600, sourceWidth: 3600 }),
    ).toBeCloseTo(300)
  })

  it('counts the ORIGINAL file, not the downscaled working copy', () => {
    const working = effectivePpi({ frameWidthPx: 1000, frameWidthIn: 10, photoScale: 0.5, workingWidth: 2000, sourceWidth: 2000 })
    const original = effectivePpi({ frameWidthPx: 1000, frameWidthIn: 10, photoScale: 0.5, workingWidth: 2000, sourceWidth: 6000 })
    expect(original).toBeCloseTo(working * 3)
  })

  it('drops as the customer zooms into the crop', () => {
    const base = { frameWidthPx: 1000, frameWidthIn: 10, workingWidth: 2000, sourceWidth: 2000 }
    expect(effectivePpi({ ...base, photoScale: 1 })).toBeLessThan(effectivePpi({ ...base, photoScale: 0.5 }))
  })

  it('drops as the frame gets physically bigger', () => {
    const base = { frameWidthPx: 1000, photoScale: 0.5, workingWidth: 2000, sourceWidth: 2000 }
    expect(effectivePpi({ ...base, frameWidthIn: 24 })).toBeLessThan(effectivePpi({ ...base, frameWidthIn: 8 }))
  })

  it('returns 0 rather than NaN/Infinity for degenerate input', () => {
    expect(effectivePpi({ frameWidthPx: 0, frameWidthIn: 12, photoScale: 1, workingWidth: 100, sourceWidth: 100 })).toBe(0)
    expect(effectivePpi({ frameWidthPx: 100, frameWidthIn: 0, photoScale: 1, workingWidth: 100, sourceWidth: 100 })).toBe(0)
    expect(effectivePpi({ frameWidthPx: 100, frameWidthIn: 12, photoScale: 0, workingWidth: 100, sourceWidth: 100 })).toBe(0)
  })
})

describe('assessPrintQuality', () => {
  it('buckets by the documented thresholds', () => {
    expect(assessPrintQuality(PPI_GOOD)).toBe('good')
    expect(assessPrintQuality(PPI_GOOD - 1)).toBe('fair')
    expect(assessPrintQuality(PPI_FAIR)).toBe('fair')
    expect(assessPrintQuality(PPI_FAIR - 1)).toBe('low')
    expect(assessPrintQuality(0)).toBe('low')
  })
})

describe('largestSharpSku', () => {
  const walnut = getProduct('walnut')

  it('suggests the biggest size that would still print sharply', () => {
    // 100 ppi at 24in wide → 150 needs ≤16in wide → 16x20 or 16x24 (same width); either is a 16in frame.
    const current = findSku('walnut', '24x36')!
    const suggestion = largestSharpSku(walnut, 'portrait', current, 100)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.width).toBe(16)
  })

  it('returns null when even the smallest size would be too soft', () => {
    expect(largestSharpSku(walnut, 'portrait', findSku('walnut', '12x18')!, 10)).toBeNull()
  })

  it('suggests the largest size available when quality is high enough for all of them', () => {
    // 400 ppi at 12in wide stays ≥150 all the way up to 32in — beyond the catalog's 24in.
    const current = findSku('walnut', '12x18')!
    expect(largestSharpSku(walnut, 'portrait', current, 400)!.width).toBe(24)
  })
})
