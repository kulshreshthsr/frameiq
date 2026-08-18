import { validateImageFile } from './imageValidation'
import { loadImageAsset, type LoadedImageAsset } from './loadImageAsset'

/** Shared entry point for every upload path (initial wall drop, wall
 * replace, per-frame photo) so validation and decoding behave identically
 * everywhere a file comes into the app. */
export async function validateAndLoadImage(file: File): Promise<LoadedImageAsset> {
  const validation = validateImageFile(file)
  if (!validation.ok) {
    throw new Error(validation.error ?? `"${file.name}" could not be used.`)
  }
  return loadImageAsset(file)
}
