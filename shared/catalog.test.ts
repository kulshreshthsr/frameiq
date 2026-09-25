import { describe, expect, it } from 'vitest'
import { defaultGlassId, defaultMatId, findGlass, findMat, findProduct, findSize, validateCatalog, type Catalog } from './catalog'
import { SEED_CATALOG } from './catalogSeed'
import { major } from './money'

const clone = (): Catalog => JSON.parse(JSON.stringify(SEED_CATALOG))

describe('seed catalog', () => {
  it('is internally consistent (no typos can reach customers)', () => {
    expect(validateCatalog(SEED_CATALOG)).toEqual([])
  })

  it('is clearly marked as placeholder data', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('shared/catalogSeed.ts', 'utf8')
    expect(source).toMatch(/PLACEHOLDER DATA/)
  })

  it('every size label matches its dimensions and id', () => {
    for (const product of SEED_CATALOG.products) {
      for (const size of product.sizes) {
        expect(size.displayLabel).toBe(`${size.width} × ${size.height} in`)
        expect(size.id).toBe(`${size.width}x${size.height}`)
      }
    }
  })

  it('prices grow with size within every product', () => {
    for (const product of SEED_CATALOG.products) {
      const bySize = [...product.sizes].sort((a, b) => a.width * a.height - b.width * b.height)
      for (let i = 1; i < bySize.length; i++) expect(bySize[i].priceMinor).toBeGreaterThan(bySize[i - 1].priceMinor)
    }
  })

  it('states the Classic Walnut example prices from the brief', () => {
    expect(findSize(SEED_CATALOG, 'walnut', '12x18')?.priceMinor).toBe(major(699))
    expect(findSize(SEED_CATALOG, 'walnut', '16x24')?.priceMinor).toBe(major(999))
    expect(findSize(SEED_CATALOG, 'walnut', '20x30')?.priceMinor).toBe(major(1499))
  })
})

describe('lookups', () => {
  it('finds products, sizes and options, and returns undefined for unknown ids', () => {
    expect(findProduct(SEED_CATALOG, 'walnut')?.name).toBe('Classic Walnut')
    expect(findProduct(SEED_CATALOG, 'nope')).toBeUndefined()
    expect(findSize(SEED_CATALOG, 'walnut', '1x1')).toBeUndefined()
    expect(findGlass(SEED_CATALOG, 'premium')?.priced).toBe(true)
    expect(findMat(SEED_CATALOG, 'none')?.hasMat).toBe(false)
  })

  it('a product that ships with a mat defaults to having one; one that does not, to none', () => {
    expect(defaultMatId(SEED_CATALOG, findProduct(SEED_CATALOG, 'white')!)).toBe('mat')
    expect(defaultMatId(SEED_CATALOG, findProduct(SEED_CATALOG, 'matte-black')!)).toBe('none')
  })

  it('the default glass is the one with no surcharge', () => {
    expect(defaultGlassId(SEED_CATALOG, findProduct(SEED_CATALOG, 'walnut')!)).toBe('standard')
  })
})

describe('validateCatalog catches owner mistakes', () => {
  it('duplicate product ids', () => {
    const c = clone()
    c.products.push({ ...c.products[0] })
    expect(validateCatalog(c).join()).toMatch(/duplicate product/)
  })

  it('non-integer, zero or negative prices', () => {
    const c = clone()
    c.products[0].sizes[0].priceMinor = 649.5
    c.products[1].sizes[0].priceMinor = 0
    c.products[2].sizes[0].glassSurchargeMinor = -1
    const problems = validateCatalog(c).join('\n')
    expect(problems).toMatch(/649.5/)
    expect(problems).toMatch(/price must be a positive/)
    expect(problems).toMatch(/glass surcharge/)
  })

  it('a size stored landscape', () => {
    const c = clone()
    c.products[0].sizes[0].width = 20
    c.products[0].sizes[0].height = 10
    expect(validateCatalog(c).join()).toMatch(/portrait/)
  })

  it('references to options that do not exist', () => {
    const c = clone()
    c.products[0].glassOptionIds.push('holographic')
    c.products[0].matOptionIds.push('velvet')
    const problems = validateCatalog(c).join('\n')
    expect(problems).toMatch(/holographic/)
    expect(problems).toMatch(/velvet/)
  })

  it('a product with no sizes', () => {
    const c = clone()
    c.products[0].sizes = []
    expect(validateCatalog(c).join()).toMatch(/no sizes/)
  })

  it('a bad delivery policy', () => {
    const c = clone()
    c.delivery.flatFeeMinor = 1.5
    expect(validateCatalog(c).join()).toMatch(/delivery/)
  })
})
