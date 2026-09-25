import { UserFacingError } from './errors'
import { validateImageFile } from './imageValidation'
import { loadImageAsset, type ImageKind } from './loadImageAsset'
import { saveOriginal } from '../order/originals'
import type { UploadedImage } from '../types/frame'

/** Shared entry point for every upload path (initial wall drop, wall
 * replace, per-frame photo) so validation and decoding behave identically
 * everywhere a file comes into the app.
 *
 * A frame photo's ORIGINAL file is kept alongside its downsized editing copy:
 * the canvas edits the copy, but an order is printed from the original. */
export async function validateAndLoadImage(file: File, kind: ImageKind): Promise<UploadedImage> {
  const validation = validateImageFile(file)
  if (!validation.ok) {
    throw new UserFacingError(validation.error ?? `That file couldn't be used.`)
  }
  const asset = await loadImageAsset(file, kind)
  if (kind === 'photo') void saveOriginal(asset.assetId, file)
  return asset
}
