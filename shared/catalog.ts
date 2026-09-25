import type { Minor } from './money'

/**
 * THE CATALOG SHAPE.
 *
 * A catalog is plain data: what can be bought, in which sizes and options, at
 * what price, and how delivery is charged. The browser and the server both
 * work on this shape through the pure functions below; where the data COMES
 * FROM (the bundled seed, or the server's database) is a separate question
 * answered elsewhere. Nothing here knows about rendering.
 */

export type Orientation = 'portrait' | 'landscape'

export interface GlassOptionDef {
  id: string
  name: string
  description: string
  /** True if choosing this glass adds the size's glass surcharge. */
  priced: boolean
}

export interface MatOptionDef {
  id: string
  name: string
  description: string
  /** True if this option is "with a mat"; false for "no mat". */
  hasMat: boolean
}

/** One purchasable size of one product (a SKU). Dimensions are the frame's
 * OUTER size, stored portrait (width ≤ height); orientation is chosen per
 * placed frame. */
export interface SizeDef {
  id: string
  width: number
  height: number
  unit: 'in'
  displayLabel: string
  priceMinor: Minor
  /** Added when a "priced" glass option is chosen. */
  glassSurchargeMinor: Minor
  /** Added when a mat is requested on a product that doesn't ship with one. */
  matSurchargeMinor: Minor
}

export interface ProductDef {
  id: string
  name: string
  tagline: string
  description: string
  /** Which rendering style draws this product in the browser. */
  styleId: string
  active: boolean
  /** Whether the product normally comes with a mat (its base price includes it). */
  shipsWithMat: boolean
  /** Free-form note about the moulding. Shown to customers if present. */
  mouldingNote?: string
  /** Free-form note for whoever produces the frame. Never shown to customers. */
  productionNotes?: string
  sizes: SizeDef[]
  glassOptionIds: string[]
  matOptionIds: string[]
}

export interface DeliveryPolicy {
  /** Charged on every order below the free threshold. */
  flatFeeMinor: Minor
  /** Orders at or above this subtotal ship free; null = never free. */
  freeAboveMinor: Minor | null
  note: string
}

export interface Catalog {
  /** Identifies this exact content; changes whenever prices or products do. */
  version: string
  currency: string
  glassOptions: GlassOptionDef[]
  matOptions: MatOptionDef[]
  products: ProductDef[]
  delivery: DeliveryPolicy
}

// ---------------------------------------------------------------- lookups

export function findProduct(catalog: Catalog, id: string): ProductDef | undefined {
  return catalog.products.find((product) => product.id === id)
}

export function findSize(catalog: Catalog, productId: string, sizeId: string): SizeDef | undefined {
  return findProduct(catalog, productId)?.sizes.find((size) => size.id === sizeId)
}

export function findGlass(catalog: Catalog, id: string): GlassOptionDef | undefined {
  return catalog.glassOptions.find((glass) => glass.id === id)
}

export function findMat(catalog: Catalog, id: string): MatOptionDef | undefined {
  return catalog.matOptions.find((mat) => mat.id === id)
}

/** The mat choice a product normally has: with a mat if it ships with one. */
export function defaultMatId(catalog: Catalog, product: ProductDef): string {
  const wantsMat = product.shipsWithMat
  const offered = product.matOptionIds.map((id) => findMat(catalog, id)).filter((mat): mat is MatOptionDef => Boolean(mat))
  return (offered.find((mat) => mat.hasMat === wantsMat) ?? offered[0])?.id ?? ''
}

export function defaultGlassId(catalog: Catalog, product: ProductDef): string {
  const offered = product.glassOptionIds.map((id) => findGlass(catalog, id)).filter((glass): glass is GlassOptionDef => Boolean(glass))
  return (offered.find((glass) => !glass.priced) ?? offered[0])?.id ?? ''
}

/**
 * Checks a catalog is internally consistent: unique ids, positive integer
 * prices, sizes stored portrait, every option reference resolves. Returns a
 * list of problems (empty = fine). Run on seed data in tests and before a
 * catalog is written to the database, so a typo never reaches customers.
 */
export function validateCatalog(catalog: Catalog): string[] {
  const problems: string[] = []
  const unique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) problems.push(`duplicate ${label} ids`)
  }
  const wholeMoney = (label: string, value: number, allowZero = false) => {
    if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) problems.push(`${label} must be a positive whole number of minor units (got ${value})`)
  }

  unique('product', catalog.products.map((p) => p.id))
  unique('glass option', catalog.glassOptions.map((g) => g.id))
  unique('mat option', catalog.matOptions.map((m) => m.id))
  if (!catalog.currency) problems.push('missing currency')
  wholeMoney('delivery flat fee', catalog.delivery.flatFeeMinor, true)
  if (catalog.delivery.freeAboveMinor !== null) wholeMoney('delivery free threshold', catalog.delivery.freeAboveMinor)

  for (const product of catalog.products) {
    const where = `product "${product.id}"`
    if (product.sizes.length === 0) problems.push(`${where} has no sizes`)
    unique(`${where} size`, product.sizes.map((s) => s.id))
    for (const size of product.sizes) {
      if (size.width > size.height) problems.push(`${where} size "${size.id}" must be stored portrait (width ≤ height)`)
      wholeMoney(`${where} size "${size.id}" price`, size.priceMinor)
      wholeMoney(`${where} size "${size.id}" glass surcharge`, size.glassSurchargeMinor, true)
      wholeMoney(`${where} size "${size.id}" mat surcharge`, size.matSurchargeMinor, true)
    }
    for (const id of product.glassOptionIds) if (!findGlass(catalog, id)) problems.push(`${where} references unknown glass option "${id}"`)
    for (const id of product.matOptionIds) if (!findMat(catalog, id)) problems.push(`${where} references unknown mat option "${id}"`)
    if (product.glassOptionIds.length === 0) problems.push(`${where} offers no glass option`)
    if (product.matOptionIds.length === 0) problems.push(`${where} offers no mat option`)
    if (product.active && !defaultMatId(catalog, product)) problems.push(`${where} has no default mat`)
  }
  return problems
}
