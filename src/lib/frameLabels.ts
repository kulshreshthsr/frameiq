import type { FrameInstance } from '../types/frame'
import { findSku, getProduct } from '../domain/catalog'
import { formatSkuInches } from '../domain/sizing'

/** "Frame 2" — the name a customer sees for the Nth frame on their wall. */
export function frameName(index: number): string {
  return `Frame ${index + 1}`
}

/** One line describing a frame in words, for screen readers and summaries:
 * "Frame 2: Classic Walnut, 12 × 18 in, photo added". */
export function describeFrame(frame: FrameInstance, index: number): string {
  const product = getProduct(frame.productId)
  const sku = findSku(frame.productId, frame.sizeId)
  const size = sku ? formatSkuInches(sku, frame.orientation) : 'size not chosen'
  return `${frameName(index)}: ${product.name}, ${size}, ${frame.photo ? 'photo added' : 'no photo yet'}`
}

/** A short textual stand-in for the (canvas-drawn) wall, so the design is
 * available to assistive technology even though the canvas itself isn't. */
export function describeDesign(frames: FrameInstance[]): string {
  if (frames.length === 0) return 'Your wall photo, with no frames yet.'
  const withPhotos = frames.filter((f) => f.photo).length
  return `Your wall with ${frames.length} frame${frames.length === 1 ? '' : 's'}; ${withPhotos} of ${frames.length} have photos.`
}
