import { clearAssets, deleteAssets, getAsset, isAssetDbAvailable, listAssetIds, putAsset } from '../persistence/assetDb'

/**
 * PRODUCTION IMAGES.
 *
 * While designing, the canvas works on downsized EDITOR images. What gets
 * printed must come from the customer's ORIGINAL file. This module keeps those
 * originals — in memory for the session, and in IndexedDB so they survive a
 * refresh — keyed by the same asset id the editor uses, and hands them back
 * when an order is placed. It also holds the final design preview.
 *
 * If storage is unavailable or full, originals simply live in memory; after a
 * refresh they'd be missing and checkout would ask the customer to add them
 * again. It never silently substitutes the small editing copy.
 */

const memory = new Map<string, Blob>()

export const previewKey = (digest: string) => `preview:${digest}`
const isPreviewKey = (id: string) => id.startsWith('preview:')

export async function saveOriginal(id: string, blob: Blob): Promise<void> {
  memory.set(id, blob)
  if (!isAssetDbAvailable()) return
  try {
    await putAsset(id, blob, 'originals')
  } catch {
    /* kept in memory only */
  }
}

export async function loadOriginal(id: string): Promise<Blob | null> {
  const cached = memory.get(id)
  if (cached) return cached
  if (!isAssetDbAvailable()) return null
  try {
    const stored = await getAsset(id, 'originals')
    if (stored) memory.set(id, stored)
    return stored
  } catch {
    return null
  }
}

export async function hasOriginal(id: string): Promise<boolean> {
  return (await loadOriginal(id)) !== null
}

/** Forgets originals nothing refers to any more. */
export async function forgetOriginals(ids: readonly string[]): Promise<void> {
  for (const id of ids) memory.delete(id)
  if (!isAssetDbAvailable()) return
  try {
    await deleteAssets(ids, 'originals')
  } catch {
    /* harmless leftovers */
  }
}

/** After a restore: drop any stored original the design no longer uses
 * (the final-design preview is kept — checkout owns it). */
export async function pruneOriginals(keep: ReadonlySet<string>): Promise<void> {
  if (!isAssetDbAvailable()) return
  try {
    const stale = (await listAssetIds('originals')).filter((id) => !keep.has(id) && !isPreviewKey(id))
    await forgetOriginals(stale)
  } catch {
    /* harmless leftovers */
  }
}

/** Starting over, or a finished order: everything production-related goes. */
export async function clearOriginals(): Promise<void> {
  memory.clear()
  if (!isAssetDbAvailable()) return
  try {
    await clearAssets('originals')
  } catch {
    /* nothing to clear */
  }
}

export function resetOriginalsForTests() {
  memory.clear()
}
