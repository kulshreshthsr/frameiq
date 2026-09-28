import { afterEach, describe, expect, it } from 'vitest'
import { getFrameStyle } from '../lib/frameStyles'
import { SEED_CATALOG } from '../../../shared/catalogSeed'
import {
  activeProducts,
  catalogRevision,
  catalogSource,
  currentCatalog,
  defaultGlassFor,
  defaultMatFor,
  defaultSkuFor,
  findSku,
  getProduct,
  hasProduct,
  productShipsWithMat,
  resetCatalogForTests,
  sellableSizes,
  setCatalog,
  startingPriceMinor,
  subscribeCatalog,
} from './catalog'
import { nearestAvailableSku } from './sizing'
import { resolveFrameStyle } from './frameStyle'

afterEach(() => resetCatalogForTests())

describe('the browser catalog registry', () => {
  it('starts with the bundled catalog and says so', () => {
    expect(catalogSource()).toBe('bundled')
    expect(currentCatalog()).toBe(SEED_CATALOG)
  })

  it('every product is backed by a real rendering style, and ships-with-mat agrees with how it is drawn', () => {
    for (const product of currentCatalog().products) {
      const style = getFrameStyle(product.styleId)
      expect(style.id).toBe(product.styleId)
      expect(product.shipsWithMat, `${product.id}: catalog says shipsWithMat but style has ${style.matColor ? 'a' : 'no'} mat`).toBe(style.matColor !== null)
    }
  })

  it('swaps in another catalog, records where it came from, and tells subscribers', () => {
    let notified = 0
    const stop = subscribeCatalog(() => notified++)
    const before = catalogRevision()
    const repriced = { ...SEED_CATALOG, version: 'server-v2', products: SEED_CATALOG.products.filter((p) => p.id !== 'gold') }
    setCatalog(repriced, 'server')
    expect(catalogSource()).toBe('server')
    expect(currentCatalog().version).toBe('server-v2')
    expect(hasProduct('gold')).toBe(false)
    expect(notified).toBe(1)
    expect(catalogRevision()).toBe(before + 1)
    stop()
    setCatalog(SEED_CATALOG, 'bundled')
    expect(notified).toBe(1) // unsubscribed
  })

  it('looks up products and sizes, and never throws on unknown ids', () => {
    expect(getProduct('walnut').name).toBe('Classic Walnut')
    expect(hasProduct('walnut')).toBe(true)
    expect(hasProduct('nope')).toBe(false)
    expect(getProduct('nope').id).toBeDefined() // falls back
    expect(findSku('walnut', '12x18')?.priceMinor).toBe(69900)
    expect(findSku('walnut', '1x1')).toBeUndefined()
    expect(findSku('nope', '12x18')).toBeUndefined()
  })

  it('a retired product is not offered, and does not count as sellable', () => {
    const retired = { ...SEED_CATALOG, products: SEED_CATALOG.products.map((p) => (p.id === 'gold' ? { ...p, active: false } : p)) }
    setCatalog(retired)
    expect(activeProducts().map((p) => p.id)).not.toContain('gold')
    expect(hasProduct('gold')).toBe(false)
  })

  it('offers only active products and reports the lowest price for "from" labels', () => {
    expect(activeProducts().every((p) => p.active)).toBe(true)
    expect(startingPriceMinor(getProduct('matte-black'))).toBe(39900)
  })

  it('picks sensible defaults from the catalog, not from literals', () => {
    expect(defaultSkuFor(getProduct('walnut')).id).toBe('12x18')
    expect(defaultGlassFor(getProduct('walnut'))).toBe('standard')
    expect(defaultMatFor(getProduct('white'))).toBe('mat')
    expect(defaultMatFor(getProduct('matte-black'))).toBe('none')
    expect(productShipsWithMat(getProduct('white'))).toBe(true)
  })

  it('a deactivated size is not sellable, but the product is unaffected if others remain', () => {
    const withInactive = { ...SEED_CATALOG, products: SEED_CATALOG.products.map((p) => (p.id === 'walnut' ? { ...p, sizes: p.sizes.map((s) => (s.id === '12x18' ? { ...s, active: false } : s)) } : p)) }
    setCatalog(withInactive)
    expect(sellableSizes(getProduct('walnut')).map((s) => s.id)).not.toContain('12x18')
    expect(hasProduct('walnut')).toBe(true) // the product itself is still fine
  })

  it('the default size skips a deactivated one', () => {
    const withInactive = { ...SEED_CATALOG, products: SEED_CATALOG.products.map((p) => (p.id === 'walnut' ? { ...p, sizes: p.sizes.map((s) => (s.id === '12x18' ? { ...s, active: false } : s)) } : p)) }
    setCatalog(withInactive)
    expect(defaultSkuFor(getProduct('walnut')).id).not.toBe('12x18')
  })

  it('"from" pricing never advertises a size that can no longer be bought', () => {
    const cheapestDeactivated = { ...SEED_CATALOG, products: SEED_CATALOG.products.map((p) => (p.id === 'matte-black' ? { ...p, sizes: p.sizes.map((s) => (s.id === '8x10' ? { ...s, active: false } : s)) } : p)) }
    setCatalog(cheapestDeactivated)
    expect(startingPriceMinor(getProduct('matte-black'))).toBeGreaterThan(39900) // no longer the (now inactive) cheapest size
  })

  it('a frame already using a since-deactivated size keeps it (checkout is what actually blocks it)', () => {
    const withInactive = { ...SEED_CATALOG, products: SEED_CATALOG.products.map((p) => (p.id === 'walnut' ? { ...p, sizes: p.sizes.map((s) => (s.id === '12x18' ? { ...s, active: false } : s)) } : p)) }
    setCatalog(withInactive)
    expect(nearestAvailableSku(getProduct('walnut'), '12x18').id).toBe('12x18')
  })

  it('choosing a size fresh (no exact match at all) only offers what is still sellable', () => {
    const withInactive = { ...SEED_CATALOG, products: SEED_CATALOG.products.map((p) => (p.id === 'walnut' ? { ...p, sizes: p.sizes.map((s) => (s.id === '12x18' ? { ...s, active: false } : s)) } : p)) }
    setCatalog(withInactive)
    expect(nearestAvailableSku(getProduct('walnut'), 'no-such-size-12x18').id).not.toBe('12x18')
  })
})

describe('resolveFrameStyle (product options → what gets drawn)', () => {
  it('draws a mat-bearing product exactly as designed by default', () => {
    expect(resolveFrameStyle('walnut', 'mat')).toBe(getFrameStyle('walnut'))
  })

  it('removes the mat when "No mat" is chosen on a product that ships with one', () => {
    const style = resolveFrameStyle('walnut', 'none')
    expect(style.matColor).toBeNull()
    expect(style.innerThicknessRatio).toBe(0)
    expect(style.woodColor).toBe(getFrameStyle('walnut').woodColor) // moulding untouched
  })

  it('adds a neutral mat when one is requested on a product that ships without', () => {
    const style = resolveFrameStyle('matte-black', 'mat')
    expect(style.matColor).not.toBeNull()
    expect(style.innerThicknessRatio).toBeGreaterThan(0)
  })

  it('leaves a mat-less product alone when it stays mat-less', () => {
    expect(resolveFrameStyle('matte-black', 'none')).toBe(getFrameStyle('matte-black'))
  })

  it('returns the SAME object for the same inputs (so memoised renders stay stable)', () => {
    expect(resolveFrameStyle('gold', 'none')).toBe(resolveFrameStyle('gold', 'none'))
    expect(resolveFrameStyle('matte-black', 'mat')).toBe(resolveFrameStyle('matte-black', 'mat'))
  })
})
