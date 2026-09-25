import { MAX_ASPECT_DRIFT, MIN_PRODUCTION_PPI } from './limits'
import type { Crop, DesignSnapshot, FrameSnapshot } from './orderSchema'

/**
 * PRODUCTION IMAGE CHECKS.
 *
 * The photo shown while editing is a downsized EDITOR IMAGE. What gets
 * printed must be the customer's PRODUCTION IMAGE (the original). These
 * functions decide whether a given original is good enough for a frame —
 * the browser uses them to tell the customer early, and the server uses the
 * same ones to refuse an order that could not be printed well.
 */

export interface ImageDims {
  width: number
  height: number
}

/**
 * Pixels-per-inch the original would print at: how many of its pixels span the
 * frame's opening, per inch of that opening. The opening's width lies along
 * the image's width for an upright photo and along its height for a photo
 * turned a quarter-turn; the lower of the two directions governs.
 */
export function printPpi(crop: Crop, openingIn: { width: number; height: number }, image: ImageDims): number {
  const quarterTurned = crop.rotationDeg === 90 || crop.rotationDeg === 270
  const pixelsAcrossOpeningWidth = (quarterTurned ? crop.height * image.height : crop.width * image.width) / openingIn.width
  const pixelsAcrossOpeningHeight = (quarterTurned ? crop.width * image.width : crop.height * image.height) / openingIn.height
  return Math.min(pixelsAcrossOpeningWidth, pixelsAcrossOpeningHeight)
}

/** Whether an original has the same shape as the editing copy the crop was
 * made on. (A crop is a fraction of the image, so any same-shaped, larger
 * copy is a valid stand-in — a differently-shaped one is not.) */
export function sameAspect(image: ImageDims, expected: ImageDims): boolean {
  const a = image.width / image.height
  const b = expected.width / expected.height
  return Math.abs(a - b) / b <= MAX_ASPECT_DRIFT
}

export type ImageProblemCode = 'missing' | 'wrong_shape' | 'low_resolution'

export interface ImageProblem {
  frameNumber: number
  assetId: string
  code: ImageProblemCode
  /** For low_resolution: what it would print at, and what is needed. */
  ppi?: number
  requiredPpi?: number
}

/**
 * Every reason the frames' photos can't be produced from what's available.
 * `originals` maps an assetId to the dimensions of its production image; an
 * absent key means "we don't have it".
 */
export function findImageProblems(snapshot: DesignSnapshot, originals: Record<string, ImageDims | undefined>): ImageProblem[] {
  const problems: ImageProblem[] = []
  for (const frame of snapshot.frames) {
    const problem = frameImageProblem(frame, originals[frame.photo?.asset.assetId ?? ''])
    if (problem) problems.push(problem)
  }
  return problems
}

export function frameImageProblem(frame: FrameSnapshot, original: ImageDims | undefined): ImageProblem | null {
  if (!frame.photo) return null
  const { asset, crop } = frame.photo
  const base = { frameNumber: frame.number, assetId: asset.assetId }
  if (!original) return { ...base, code: 'missing' }
  if (!sameAspect(original, { width: asset.sourceWidth, height: asset.sourceHeight })) return { ...base, code: 'wrong_shape' }
  const ppi = printPpi(crop, frame.openingIn, original)
  if (ppi < MIN_PRODUCTION_PPI) return { ...base, code: 'low_resolution', ppi: Math.round(ppi), requiredPpi: MIN_PRODUCTION_PPI }
  return null
}

/** True when the crop lies inside the image — i.e. the photo genuinely covers
 * the opening, so nothing blank would be printed. */
export function cropIsInsideImage(crop: Crop, tolerance = 1e-3): boolean {
  return (
    crop.x >= -tolerance &&
    crop.y >= -tolerance &&
    crop.x + crop.width <= 1 + tolerance &&
    crop.y + crop.height <= 1 + tolerance
  )
}
