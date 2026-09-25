import type { FrameInstance } from '../types/frame'
import { findSku } from '../domain/catalog'
import { skuDimensionsIn, isSquareSku } from '../domain/sizing'
import { assessPrintQuality, effectivePpi, type PrintQuality } from '../domain/printQuality'

/** The value every frame agrees on, or null if they differ (or there are none).
 * Used to show "all frames are X" vs "mixed" when the scope is the whole wall. */
export function commonValue<T>(frames: readonly FrameInstance[], pick: (frame: FrameInstance) => T): T | null {
  if (frames.length === 0) return null
  const first = pick(frames[0])
  return frames.every((frame) => pick(frame) === first) ? first : null
}

export interface PhotoAssessment {
  ppi: number
  quality: PrintQuality
}

/** How sharply a frame's photo would print at the frame's current size and
 * crop, or null if the frame has no photo. */
export function assessFramePhoto(frame: FrameInstance): PhotoAssessment | null {
  if (!frame.photo) return null
  const sku = findSku(frame.productId, frame.sizeId)
  if (!sku) return null
  const widthIn = skuDimensionsIn(sku, isSquareSku(sku) ? 'portrait' : frame.orientation).width
  const ppi = effectivePpi({
    frameWidthPx: frame.width,
    frameWidthIn: widthIn,
    photoScale: frame.photoTransform.scale,
    workingWidth: frame.photo.width,
    sourceWidth: frame.photo.sourceWidth,
  })
  return { ppi, quality: assessPrintQuality(ppi) }
}
