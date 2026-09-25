import { findImageProblems, type ImageDims, type ImageProblem } from '../../shared/production'
import type { DesignSnapshot } from '../../shared/orderSchema'
import { loadOriginal } from './originals'

/**
 * Before an order is created, confirm every photo has a PRODUCTION image good
 * enough to print. The server checks again (it doesn't trust us), but telling
 * the customer here — early, with a way to fix it — beats a rejection at the
 * last step.
 *
 * `replacements` are originals the customer re-supplied in checkout (e.g.
 * after a refresh lost the stored one); they are measured for real, since the
 * editing copy can't vouch for a different file.
 */

export interface OriginalsReport {
  problems: ImageProblem[]
  /** The blob to upload for each asset that has a usable production image. */
  blobs: Map<string, Blob>
}

/** Decodes an image just to learn its displayed size (EXIF orientation applied,
 * exactly as the editor and the server measure it). */
export async function measureImage(blob: Blob): Promise<ImageDims | null> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img.naturalWidth > 0 && img.naturalHeight > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function checkOriginals(snapshot: DesignSnapshot, replacements: ReadonlyMap<string, Blob> = new Map()): Promise<OriginalsReport> {
  const blobs = new Map<string, Blob>()
  const dims: Record<string, ImageDims | undefined> = {}

  for (const frame of snapshot.frames) {
    if (!frame.photo) continue
    const { asset } = frame.photo
    if (blobs.has(asset.assetId)) continue

    const replacement = replacements.get(asset.assetId)
    if (replacement) {
      const measured = await measureImage(replacement)
      if (measured) {
        blobs.set(asset.assetId, replacement)
        dims[asset.assetId] = measured
      }
      continue
    }

    const stored = await loadOriginal(asset.assetId)
    if (stored) {
      blobs.set(asset.assetId, stored)
      // The original was measured when it was added; it is the same file.
      dims[asset.assetId] = { width: asset.sourceWidth, height: asset.sourceHeight }
    }
  }

  return { problems: findImageProblems(snapshot, dims), blobs }
}
