import type { FrameProduct, FrameSku, Orientation } from './catalog'
import { isSquareSku, skuDimensionsIn } from './sizing'

/**
 * Will a customer's photo print sharply at the chosen size?
 *
 * The photo sits in the frame at `photoScale` (frame pixels per photo pixel),
 * and the frame's outer width in pixels corresponds to its real width in
 * inches. So one photo pixel covers `photoScale × (inches / framePixels)`
 * inches, and pixels-per-inch is the reciprocal. Working-copy pixels are
 * converted back to the ORIGINAL file's pixels, because the print would be
 * made from the original, not from the downscaled editing copy.
 */

export const PPI_GOOD = 150
export const PPI_FAIR = 100

export type PrintQuality = 'good' | 'fair' | 'low'

export interface PpiInput {
  frameWidthPx: number
  frameWidthIn: number
  photoScale: number
  workingWidth: number
  sourceWidth: number
}

export function effectivePpi(input: PpiInput): number {
  const { frameWidthPx, frameWidthIn, photoScale, workingWidth, sourceWidth } = input
  if (frameWidthPx <= 0 || frameWidthIn <= 0 || photoScale <= 0 || workingWidth <= 0) return 0
  const inchesPerFramePx = frameWidthIn / frameWidthPx
  const workingPpi = 1 / (photoScale * inchesPerFramePx)
  return workingPpi * (Math.max(sourceWidth, 1) / workingWidth)
}

export function assessPrintQuality(ppi: number): PrintQuality {
  if (ppi >= PPI_GOOD) return 'good'
  if (ppi >= PPI_FAIR) return 'fair'
  return 'low'
}

/** The largest size in the same orientation that would still print at
 * "good" quality if the same crop were kept, or null if none would. Size
 * scales ppi inversely with the frame's width. */
export function largestSharpSku(
  product: FrameProduct,
  orientation: Orientation,
  current: Pick<FrameSku, 'width' | 'height'>,
  currentPpi: number,
): FrameSku | null {
  const currentWidth = skuDimensionsIn(current, orientation).width
  let best: FrameSku | null = null
  for (const sku of product.sizes) {
    const width = skuDimensionsIn(sku, isSquareSku(sku) ? 'portrait' : orientation).width
    if (currentPpi * (currentWidth / width) >= PPI_GOOD && (!best || width > skuDimensionsIn(best, orientation).width)) {
      best = sku
    }
  }
  return best
}
