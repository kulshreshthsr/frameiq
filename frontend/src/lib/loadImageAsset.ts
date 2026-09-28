import { MAX_PHOTO_DIMENSION, MAX_WALL_DIMENSION, MIN_PHOTO_DIMENSION, MIN_WALL_DIMENSION } from './constants'
import { UserFacingError } from './errors'
import { createId } from './id'
import type { UploadedImage } from '../types/frame'

export type ImageKind = 'wall' | 'photo'

const LIMITS: Record<ImageKind, { maxEdge: number; minEdge: number; tooSmall: string }> = {
  wall: {
    maxEdge: MAX_WALL_DIMENSION,
    minEdge: MIN_WALL_DIMENSION,
    tooSmall: 'That wall photo is too small to preview well. Please use a larger one.',
  },
  photo: {
    maxEdge: MAX_PHOTO_DIMENSION,
    minEdge: MIN_PHOTO_DIMENSION,
    tooSmall: 'That photo is too small to print well. Please choose a larger one.',
  },
}

/**
 * Decodes a File into a usable image asset. Uses HTMLImageElement.decode()
 * so the (often expensive) decode step doesn't block the main thread the
 * way relying purely on the `load` event can.
 *
 * The original File is never touched. Anything bigger than the working
 * limit for its kind is downscaled into a working copy (see constants.ts for
 * why) — the original pixel size is remembered in sourceWidth/sourceHeight.
 */
export async function loadImageAsset(file: File, kind: ImageKind): Promise<UploadedImage> {
  const limits = LIMITS[kind]
  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.src = objectUrl

  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(objectUrl)
    throw new UserFacingError(`We couldn't open that photo — it may be damaged. Try saving it again or choosing another.`)
  }

  const width = img.naturalWidth
  const height = img.naturalHeight
  if (width === 0 || height === 0) {
    URL.revokeObjectURL(objectUrl)
    throw new UserFacingError(`That file doesn't look like a photo. Please choose a JPG, PNG or WEBP image.`)
  }
  if (Math.max(width, height) < limits.minEdge) {
    URL.revokeObjectURL(objectUrl)
    throw new UserFacingError(limits.tooSmall)
  }

  const assetId = createId('asset')

  if (Math.max(width, height) <= limits.maxEdge) {
    return { assetId, src: objectUrl, width, height, sourceWidth: width, sourceHeight: height }
  }

  const downscaled = await downscaleToWorkingCopy(img, width, height, limits.maxEdge)
  if (!downscaled) {
    // Keep the full-size image rather than failing: heavier, but it works.
    return { assetId, src: objectUrl, width, height, sourceWidth: width, sourceHeight: height }
  }
  URL.revokeObjectURL(objectUrl)
  return { assetId, src: downscaled.src, width: downscaled.width, height: downscaled.height, sourceWidth: width, sourceHeight: height }
}

async function downscaleToWorkingCopy(
  img: HTMLImageElement,
  width: number,
  height: number,
  maxEdge: number,
): Promise<{ src: string; width: number; height: number } | null> {
  const scale = maxEdge / Math.max(width, height)
  const targetWidth = Math.round(width * scale)
  const targetHeight = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) return null

  return { src: URL.createObjectURL(blob), width: targetWidth, height: targetHeight }
}
