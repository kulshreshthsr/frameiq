import type { FrameInstance, UploadedImage, WallImage } from '../types/frame'
import { revokeIfBlobUrl } from '../lib/objectUrl'

/**
 * OBJECT-URL LIFECYCLE
 *
 * Every uploaded image is an object URL that pins its decoded pixels in
 * memory until it is revoked. An asset must stay alive for as long as ANYTHING can still show it —
 * the current design, or any state Undo/Redo can still return to. It must
 * be released the moment nothing can. This module owns that rule so no
 * individual store action has to reason about it (and none can forget to).
 *
 * `reconcileAssets` is called after any change to the wall or to history.
 * It computes the set of assets still referenced and revokes the rest.
 */

interface Referrer {
  wall: WallImage | null
  frames: readonly FrameInstance[]
  past: readonly { frames: readonly FrameInstance[] }[]
  future: readonly { frames: readonly FrameInstance[] }[]
}

/** assetId → src for every asset currently held alive. */
const live = new Map<string, string>()

function collect(state: Referrer): Map<string, string> {
  const referenced = new Map<string, string>()
  const add = (image: UploadedImage | null | undefined) => {
    if (image) referenced.set(image.assetId, image.src)
  }
  add(state.wall)
  for (const frame of state.frames) add(frame.photo)
  for (const entry of state.past) for (const frame of entry.frames) add(frame.photo)
  for (const entry of state.future) for (const frame of entry.frames) add(frame.photo)
  return referenced
}

export function reconcileAssets(state: Referrer): string[] {
  const referenced = collect(state)
  const released: string[] = []
  for (const [assetId, src] of live) {
    if (!referenced.has(assetId)) {
      revokeIfBlobUrl(src)
      live.delete(assetId)
      released.push(assetId)
    }
  }
  for (const [assetId, src] of referenced) live.set(assetId, src)
  return released
}

export function resetAssetLifecycleForTests() {
  live.clear()
}
