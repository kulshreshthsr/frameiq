import { MAX_WALL_WIDTH_CM, MIN_WALL_WIDTH_CM } from '../../shared/limits'
import type { FrameProduct, FrameSku, Orientation } from './catalog'

/**
 * PHYSICAL SIZE MODEL
 *
 * The composition itself stays normalized (percentages of a "placement
 * surface"). Real-world scale comes from ONE customer input: the approximate
 * width of the wall. That single number turns surface pixels into centimetres
 * (`pxPerCm` in domain/placement.ts), so a 12 × 18 in catalog frame is drawn
 * at the size it would really appear on that wall.
 *
 * It is deliberately approximate: it assumes the photographed wall (or the
 * marked wall region) is roughly head-on, and that the customer's width guess
 * is decent. The UI says "approximate" wherever a size is shown.
 */

export const DEFAULT_WALL_WIDTH_CM = 300
export { MIN_WALL_WIDTH_CM, MAX_WALL_WIDTH_CM }
export const CM_PER_INCH = 2.54

export interface SizeCm {
  width: number
  height: number
}

export function isSquareSku(sku: Pick<FrameSku, 'width' | 'height'>): boolean {
  return sku.width === sku.height
}

/** Outer frame size in centimetres for a SKU in a given orientation. SKUs are
 * stored portrait (width ≤ height); landscape swaps the two. */
export function skuDimensionsCm(sku: Pick<FrameSku, 'width' | 'height'>, orientation: Orientation): SizeCm {
  const w = sku.width * CM_PER_INCH
  const h = sku.height * CM_PER_INCH
  return orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h }
}

export function skuDimensionsIn(sku: Pick<FrameSku, 'width' | 'height'>, orientation: Orientation): SizeCm {
  return orientation === 'landscape' ? { width: sku.height, height: sku.width } : { width: sku.width, height: sku.height }
}

export function formatSkuInches(sku: Pick<FrameSku, 'width' | 'height'>, orientation: Orientation = 'portrait'): string {
  const { width, height } = skuDimensionsIn(sku, orientation)
  return `${width} × ${height} in`
}

export function formatSkuCm(sku: Pick<FrameSku, 'width' | 'height'>, orientation: Orientation = 'portrait'): string {
  const { width, height } = skuDimensionsCm(sku, orientation)
  return `${Math.round(width)} × ${Math.round(height)} cm`
}

/** "300 cm · 9 ft 10 in" — both units, since customers think in either. */
export function formatWallWidth(widthCm: number): string {
  const totalInches = Math.round(widthCm / CM_PER_INCH)
  const feet = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  return `${Math.round(widthCm)} cm · ${feet} ft ${inches} in`
}

export function isValidWallWidthCm(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_WALL_WIDTH_CM && value <= MAX_WALL_WIDTH_CM
}

/** Returns the value if usable, otherwise the default — persisted or typed
 * input can never put the scale into an invalid state. */
export function sanitizeWallWidthCm(value: number): number {
  return isValidWallWidthCm(value) ? value : DEFAULT_WALL_WIDTH_CM
}

export interface SizeChoice {
  sku: FrameSku
  orientation: Orientation
}

/**
 * Picks the catalog size (and orientation) that best matches a layout slot's
 * suggested physical footprint. "Best" = smallest total log-ratio error on
 * both sides, so a slot twice as wide and half as tall is as far off as its
 * mirror image. Log space makes over- and under-sizing symmetric.
 *
 * This is how the two worlds meet: the slot proposes a rough size (a fraction
 * of the wall), the catalog answers with a real product whose proportions are
 * then used exactly — the frame is never stretched to fit the slot.
 */
export function chooseSizeForSlot(product: FrameProduct, slotWidthCm: number, slotHeightCm: number): SizeChoice {
  let best: SizeChoice | null = null
  let bestError = Infinity
  const targetW = Math.max(slotWidthCm, 1)
  const targetH = Math.max(slotHeightCm, 1)

  for (const sku of product.sizes) {
    const orientations: Orientation[] = isSquareSku(sku) ? ['portrait'] : ['portrait', 'landscape']
    for (const orientation of orientations) {
      const dims = skuDimensionsCm(sku, orientation)
      const error = Math.abs(Math.log(dims.width / targetW)) + Math.abs(Math.log(dims.height / targetH))
      if (error < bestError - 1e-12) {
        bestError = error
        best = { sku, orientation }
      }
    }
  }
  // Every product has at least one size; the fallback only satisfies the type checker.
  return best ?? { sku: product.sizes[0], orientation: 'portrait' }
}

/** The closest size the product actually offers to a previously chosen
 * size id (used when the product changes or a stale id is restored). */
export function nearestAvailableSku(product: FrameProduct, sizeId: string): FrameSku {
  const exact = product.sizes.find((sku) => sku.id === sizeId)
  if (exact) return exact
  const wanted = /^(\d+)x(\d+)$/.exec(sizeId)
  if (!wanted) return product.sizes[0]
  const area = Number(wanted[1]) * Number(wanted[2])
  return product.sizes.reduce((best, sku) =>
    Math.abs(sku.width * sku.height - area) < Math.abs(best.width * best.height - area) ? sku : best,
  )
}
