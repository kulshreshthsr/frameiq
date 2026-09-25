import {
  defaultGlassId,
  defaultMatId,
  findGlass,
  findMat,
  findProduct,
  findSize,
  type Catalog,
  type GlassOptionDef,
  type MatOptionDef,
  type Orientation,
  type ProductDef,
  type SizeDef,
} from '../../shared/catalog'
import { SEED_CATALOG } from '../../shared/catalogSeed'
import type { Minor } from '../../shared/money'

/**
 * THE BROWSER'S VIEW OF THE CATALOG.
 *
 * The catalog data and the pricing rules live in `shared/` (the server uses
 * the same code). This module is the seam the UI talks to: a registry holding
 * whichever catalog is current — the copy bundled with the app until the
 * server's own copy arrives, then that one — with lookup helpers on top.
 * Components never import catalog data directly, so where it comes from can
 * change without touching them.
 */

export type { Catalog, Orientation }
export type FrameProduct = ProductDef
export type FrameSku = SizeDef
export type GlassOption = GlassOptionDef
export type MatOption = MatOptionDef
/** Option ids come from the catalog, so they are plain strings here. */
export type GlassId = string
export type MatId = string

/** Where the current catalog came from. Ordering needs 'server'. */
export type CatalogSource = 'bundled' | 'server'

let current: Catalog = SEED_CATALOG
let source: CatalogSource = 'bundled'
let revision = 0
const listeners = new Set<() => void>()

export function currentCatalog(): Catalog {
  return current
}

export function catalogSource(): CatalogSource {
  return source
}

/** Replaces the catalog (e.g. with the server's). Notifies subscribers so
 * anything showing a price re-renders. */
export function setCatalog(catalog: Catalog, from: CatalogSource = 'server') {
  current = catalog
  source = from
  revision += 1
  listeners.forEach((listener) => listener())
}

export function resetCatalogForTests() {
  setCatalog(SEED_CATALOG, 'bundled')
}

/** For `useSyncExternalStore`. */
export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function catalogRevision(): number {
  return revision
}

// ---------------------------------------------------------------- lookups

export const DEFAULT_PRODUCT_ID = 'natural-oak'

export function activeProducts(): FrameProduct[] {
  return current.products.filter((product) => product.active)
}

/** Falls back to the default (or first active) product for unknown/retired
 * ids, so a stale id (old saved draft, edited catalog) can never crash a render. */
export function getProduct(id: string): FrameProduct {
  return findProduct(current, id) ?? findProduct(current, DEFAULT_PRODUCT_ID) ?? activeProducts()[0] ?? current.products[0]
}

export function hasProduct(id: string): boolean {
  const product = findProduct(current, id)
  return Boolean(product && product.active)
}

export function findSku(productId: string, sizeId: string): FrameSku | undefined {
  return findSize(current, productId, sizeId)
}

const DEFAULT_SIZE_ID = '12x18'

export function defaultSkuFor(product: FrameProduct): FrameSku {
  return product.sizes.find((sku) => sku.id === DEFAULT_SIZE_ID) ?? product.sizes[0]
}

/** Lowest price the product is sold at — for "From ₹399" style labels. */
export function startingPriceMinor(product: FrameProduct): Minor {
  return Math.min(...product.sizes.map((sku) => sku.priceMinor))
}

export function getGlassOption(id: string): GlassOption {
  return findGlass(current, id) ?? current.glassOptions[0]
}

export function getMatOption(id: string): MatOption {
  return findMat(current, id) ?? current.matOptions[0]
}

export function productShipsWithMat(product: FrameProduct): boolean {
  return product.shipsWithMat
}

export function defaultMatFor(product: FrameProduct): MatId {
  return defaultMatId(current, product)
}

export function matHasMat(matId: MatId): boolean {
  return findMat(current, matId)?.hasMat ?? false
}

export function defaultGlassFor(product: FrameProduct): GlassId {
  return defaultGlassId(current, product)
}
