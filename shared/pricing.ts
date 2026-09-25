import { findGlass, findMat, findProduct, findSize, type Catalog, type DeliveryPolicy } from './catalog'
import type { Minor } from './money'

/**
 * The pricing engine — the ONE implementation of "what does this cost".
 * The browser uses it to show a live price; the server uses it to decide the
 * price that is actually charged. Pure functions over a catalog: no UI, no
 * state, no floats (see money.ts).
 */

export interface ConfiguredFrame {
  id: string
  productId: string
  sizeId: string
  glassId: string
  matId: string
}

export interface QuoteLine {
  key: string
  productId: string
  sizeId: string
  glassId: string
  matId: string
  productName: string
  sizeLabel: string
  /** Options worth mentioning next to the size ("Premium glass · With mat"). */
  optionsLabel: string | null
  quantity: number
  unitPriceMinor: Minor
  lineTotalMinor: Minor
  frameIds: string[]
}

export interface Quote {
  currency: string
  lines: QuoteLine[]
  frameCount: number
  totalMinor: Minor
  /** Frames whose configuration isn't sold (stale/unknown/inactive). They are
   * excluded from the total so a wrong price is never shown. */
  unpricedFrameIds: string[]
}

/** Price of one configured frame, or null if the configuration isn't a real,
 * currently-sold catalog item. */
export function priceFrame(catalog: Catalog, frame: Pick<ConfiguredFrame, 'productId' | 'sizeId' | 'glassId' | 'matId'>): Minor | null {
  const product = findProduct(catalog, frame.productId)
  const size = findSize(catalog, frame.productId, frame.sizeId)
  const glass = findGlass(catalog, frame.glassId)
  const mat = findMat(catalog, frame.matId)
  if (!product || !product.active || !size || !glass || !mat) return null
  if (!product.glassOptionIds.includes(glass.id) || !product.matOptionIds.includes(mat.id)) return null

  let price = size.priceMinor
  if (glass.priced) price += size.glassSurchargeMinor
  // A mat that ships with the product is already in its base price; only a
  // mat added to a product without one is a surcharge.
  if (mat.hasMat && !product.shipsWithMat) price += size.matSurchargeMinor
  return price
}

function describeOptions(catalog: Catalog, frame: ConfiguredFrame): string | null {
  const product = findProduct(catalog, frame.productId)
  const glass = findGlass(catalog, frame.glassId)
  const mat = findMat(catalog, frame.matId)
  if (!product || !glass || !mat) return null
  const parts: string[] = []
  if (glass.priced) parts.push(glass.name)
  // Only call out the mat when it differs from what the product normally is.
  if (mat.hasMat !== product.shipsWithMat) parts.push(mat.name)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Groups identical configurations into lines with a quantity — three
 * matching frames are one line "3 × 12 × 18 in Walnut", not three rows. */
export function buildQuote(catalog: Catalog, frames: readonly ConfiguredFrame[]): Quote {
  const lines = new Map<string, QuoteLine>()
  const unpriced: string[] = []

  for (const frame of frames) {
    const unit = priceFrame(catalog, frame)
    const product = findProduct(catalog, frame.productId)
    const size = findSize(catalog, frame.productId, frame.sizeId)
    if (unit === null || !product || !size) {
      unpriced.push(frame.id)
      continue
    }
    const key = [frame.productId, frame.sizeId, frame.glassId, frame.matId].join('|')
    const existing = lines.get(key)
    if (existing) {
      existing.quantity += 1
      existing.lineTotalMinor += unit
      existing.frameIds.push(frame.id)
    } else {
      lines.set(key, {
        key,
        productId: frame.productId,
        sizeId: frame.sizeId,
        glassId: frame.glassId,
        matId: frame.matId,
        productName: product.name,
        sizeLabel: size.displayLabel,
        optionsLabel: describeOptions(catalog, frame),
        quantity: 1,
        unitPriceMinor: unit,
        lineTotalMinor: unit,
        frameIds: [frame.id],
      })
    }
  }

  const list = [...lines.values()]
  return {
    currency: catalog.currency,
    lines: list,
    frameCount: frames.length,
    totalMinor: list.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    unpricedFrameIds: unpriced,
  }
}

// ---------------------------------------------------------------- delivery

/** Delivery charge for a given subtotal. An empty order ships nothing. */
export function computeDeliveryFee(policy: DeliveryPolicy, subtotalMinor: Minor): Minor {
  if (subtotalMinor <= 0) return 0
  if (policy.freeAboveMinor !== null && subtotalMinor >= policy.freeAboveMinor) return 0
  return policy.flatFeeMinor
}

export interface OrderTotals {
  currency: string
  lines: QuoteLine[]
  subtotalMinor: Minor
  deliveryFeeMinor: Minor
  totalMinor: Minor
  unpricedFrameIds: string[]
}

/** Everything a customer pays: the frames, the delivery charge, the total. */
export function computeOrderTotals(catalog: Catalog, frames: readonly ConfiguredFrame[]): OrderTotals {
  const quote = buildQuote(catalog, frames)
  const deliveryFeeMinor = computeDeliveryFee(catalog.delivery, quote.totalMinor)
  return {
    currency: quote.currency,
    lines: quote.lines,
    subtotalMinor: quote.totalMinor,
    deliveryFeeMinor,
    totalMinor: quote.totalMinor + deliveryFeeMinor,
    unpricedFrameIds: quote.unpricedFrameIds,
  }
}

