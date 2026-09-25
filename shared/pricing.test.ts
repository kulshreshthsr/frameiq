import { describe, expect, it } from 'vitest'
import { findSize, type Catalog } from './catalog'
import { SEED_CATALOG } from './catalogSeed'
import { formatMoney, major } from './money'
import { buildQuote, computeDeliveryFee, computeOrderTotals, priceFrame, type ConfiguredFrame } from './pricing'

const catalog = SEED_CATALOG
const frame = (over: Partial<ConfiguredFrame> = {}): ConfiguredFrame => ({
  id: 'f1',
  productId: 'walnut',
  sizeId: '12x18',
  glassId: 'standard',
  matId: 'mat',
  ...over,
})
const clone = (): Catalog => JSON.parse(JSON.stringify(catalog))

describe('money', () => {
  it('converts major units to integer minor units without float drift', () => {
    expect(major(699)).toBe(69900)
    expect(major(0.1 + 0.2)).toBe(30) // 0.30000000000000004 → 30, not 30.000000000000004
    expect(Number.isInteger(major(1499.99))).toBe(true)
  })

  it('formats whole rupees without decimals and fractional amounts with two', () => {
    expect(formatMoney(69900)).toBe('₹699')
    expect(formatMoney(284700)).toBe('₹2,847')
    expect(formatMoney(149950)).toBe('₹1,499.50')
    expect(formatMoney(0)).toBe('₹0')
  })
})

describe('priceFrame', () => {
  it('prices from the size table (the illustrative Walnut example)', () => {
    expect(priceFrame(catalog, frame({ sizeId: '12x18' }))).toBe(major(699))
    expect(priceFrame(catalog, frame({ sizeId: '16x24' }))).toBe(major(999))
    expect(priceFrame(catalog, frame({ sizeId: '20x30' }))).toBe(major(1499))
  })

  it('adds the size-specific glass surcharge only for premium glass', () => {
    const base = priceFrame(catalog, frame())!
    const premium = priceFrame(catalog, frame({ glassId: 'premium' }))!
    expect(premium - base).toBe(findSize(catalog, 'walnut', '12x18')!.glassSurchargeMinor)
  })

  it('does not charge for (or discount) a mat on a product that ships with one', () => {
    expect(priceFrame(catalog, frame({ matId: 'mat' }))).toBe(priceFrame(catalog, frame({ matId: 'none' })))
  })

  it('charges the mat surcharge when a mat is added to a product that ships without one', () => {
    const size = findSize(catalog, 'matte-black', '12x18')!
    const without = priceFrame(catalog, frame({ productId: 'matte-black', matId: 'none' }))!
    const withMat = priceFrame(catalog, frame({ productId: 'matte-black', matId: 'mat' }))!
    expect(withMat - without).toBe(size.matSurchargeMinor)
  })

  it('returns null for configurations that are not sold', () => {
    expect(priceFrame(catalog, frame({ productId: 'retired-frame' }))).toBeNull()
    expect(priceFrame(catalog, frame({ sizeId: '99x99' }))).toBeNull()
    expect(priceFrame(catalog, frame({ glassId: 'holographic' }))).toBeNull()
    expect(priceFrame(catalog, frame({ matId: 'velvet' }))).toBeNull()
  })

  it('will not price an inactive product', () => {
    const c = clone()
    c.products.find((p) => p.id === 'walnut')!.active = false
    expect(priceFrame(c, frame())).toBeNull()
  })

  it('will not price an option the product does not offer', () => {
    const c = clone()
    c.products.find((p) => p.id === 'walnut')!.glassOptionIds = ['standard']
    expect(priceFrame(c, frame({ glassId: 'premium' }))).toBeNull()
  })

  it('every catalog price is a positive integer number of minor units', () => {
    for (const product of catalog.products) {
      for (const size of product.sizes) {
        for (const value of [size.priceMinor, size.glassSurchargeMinor, size.matSurchargeMinor]) {
          expect(Number.isInteger(value)).toBe(true)
          expect(value).toBeGreaterThan(0)
        }
      }
    }
  })

  it('follows a changed catalog — the engine holds no prices of its own', () => {
    const c = clone()
    c.products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!.priceMinor = major(1099)
    expect(priceFrame(c, frame())).toBe(major(1099))
    expect(priceFrame(catalog, frame())).toBe(major(699)) // the original is untouched
  })
})

describe('buildQuote', () => {
  it('groups identical configurations into one line with a quantity', () => {
    const quote = buildQuote(catalog, [frame({ id: 'a' }), frame({ id: 'b' }), frame({ id: 'c', sizeId: '16x24' })])
    expect(quote.lines).toHaveLength(2)
    const twelve = quote.lines.find((l) => l.sizeLabel === '12 × 18 in')!
    expect(twelve.quantity).toBe(2)
    expect(twelve.unitPriceMinor).toBe(major(699))
    expect(twelve.lineTotalMinor).toBe(major(1398))
    expect(twelve.frameIds).toEqual(['a', 'b'])
    expect(quote.totalMinor).toBe(major(699 * 2 + 999))
    expect(quote.frameCount).toBe(3)
  })

  it('keeps different options on the same size as separate lines', () => {
    const quote = buildQuote(catalog, [frame({ id: 'a' }), frame({ id: 'b', glassId: 'premium' })])
    expect(quote.lines).toHaveLength(2)
    expect(quote.lines.map((l) => l.optionsLabel)).toEqual([null, 'Premium glass'])
  })

  it('only mentions a mat when it differs from what the product normally is', () => {
    const [standardWalnut] = buildQuote(catalog, [frame()]).lines
    expect(standardWalnut.optionsLabel).toBeNull()
    const [noMat] = buildQuote(catalog, [frame({ matId: 'none' })]).lines
    expect(noMat.optionsLabel).toBe('No mat')
    const [addedMat] = buildQuote(catalog, [frame({ productId: 'matte-black', matId: 'mat' })]).lines
    expect(addedMat.optionsLabel).toBe('With mat')
  })

  it('excludes unsellable frames from the total instead of guessing a price', () => {
    const quote = buildQuote(catalog, [frame({ id: 'ok' }), frame({ id: 'bad', productId: 'gone' })])
    expect(quote.unpricedFrameIds).toEqual(['bad'])
    expect(quote.totalMinor).toBe(major(699))
    expect(quote.frameCount).toBe(2)
  })

  it('is exact for large quantities (no floating point accumulation)', () => {
    const many = Array.from({ length: 24 }, (_, i) => frame({ id: `f${i}`, sizeId: '8x10', productId: 'natural-oak' }))
    const quote = buildQuote(catalog, many)
    expect(quote.totalMinor).toBe(24 * findSize(catalog, 'natural-oak', '8x10')!.priceMinor)
    expect(Number.isInteger(quote.totalMinor)).toBe(true)
  })

  it('an empty design costs nothing', () => {
    const quote = buildQuote(catalog, [])
    expect(quote.totalMinor).toBe(0)
    expect(quote.lines).toEqual([])
  })

  it('carries the ids a later order needs (so lines can be re-priced or audited)', () => {
    const [line] = buildQuote(catalog, [frame()]).lines
    expect(line).toMatchObject({ productId: 'walnut', sizeId: '12x18', glassId: 'standard', matId: 'mat' })
  })
})

describe('delivery and order totals', () => {
  const policy = catalog.delivery

  it('charges the flat fee below the free threshold', () => {
    expect(computeDeliveryFee(policy, major(999))).toBe(policy.flatFeeMinor)
  })

  it('is free at and above the threshold', () => {
    expect(computeDeliveryFee(policy, policy.freeAboveMinor!)).toBe(0)
    expect(computeDeliveryFee(policy, policy.freeAboveMinor! + 1)).toBe(0)
    expect(computeDeliveryFee(policy, policy.freeAboveMinor! - 1)).toBe(policy.flatFeeMinor)
  })

  it('never charges delivery on nothing', () => {
    expect(computeDeliveryFee(policy, 0)).toBe(0)
  })

  it('can be configured to never be free', () => {
    expect(computeDeliveryFee({ ...policy, freeAboveMinor: null }, major(1_000_000))).toBe(policy.flatFeeMinor)
  })

  it('total = frames + delivery, exactly, in integer minor units', () => {
    const totals = computeOrderTotals(catalog, [frame({ id: 'a' })])
    expect(totals.subtotalMinor).toBe(major(699))
    expect(totals.deliveryFeeMinor).toBe(major(149))
    expect(totals.totalMinor).toBe(major(699 + 149))
    expect(Number.isInteger(totals.totalMinor)).toBe(true)
  })

  it('a big order ships free', () => {
    const frames = Array.from({ length: 5 }, (_, i) => frame({ id: `f${i}` }))
    const totals = computeOrderTotals(catalog, frames)
    expect(totals.subtotalMinor).toBe(major(699 * 5))
    expect(totals.deliveryFeeMinor).toBe(0)
    expect(totals.totalMinor).toBe(totals.subtotalMinor)
  })

  it('reports frames that could not be priced rather than silently dropping them', () => {
    expect(computeOrderTotals(catalog, [frame({ id: 'x', productId: 'nope' })]).unpricedFrameIds).toEqual(['x'])
  })
})
