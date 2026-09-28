import { useCompositionStore } from '../state/compositionStore'
import { useJourneyStore, type StepId } from '../state/journeyStore'
import { useUIStore } from '../state/uiStore'
import type { FrameInstance, PhotoAsset, UploadedImage, WallImage } from '../types/frame'
import { clearAssets, deleteAssets, getAsset, isAssetDbAvailable, listAssetIds, putAsset } from './assetDb'
import { clearOriginals, pruneOriginals } from '../order/originals'
import { DRAFT_STORAGE_KEY, draftAssetIds, parseDraft, serializeDraft, type PersistedImage } from './draft'

/**
 * Keeps the customer's in-progress design across refreshes and tab loss.
 *
 *  - Structured state → localStorage (small JSON).
 *  - Image pixels     → IndexedDB, keyed by assetId (see assetDb.ts).
 *  - On restore, blobs are re-linked to fresh object URLs.
 *
 * Ordering is what makes a crash mid-save safe: assets are written BEFORE the
 * JSON that references them, so a saved draft never points at an image that
 * isn't there. The reverse — an orphaned asset — is harmless and swept up.
 *
 * If storage is unavailable, everything here degrades to a no-op and the
 * editor keeps working; the customer is told once that progress can't be saved.
 */

const SAVE_DEBOUNCE_MS = 400

/** Assets known to be in IndexedDB right now. */
const persistedAssets = new Set<string>()
/** Bumped by discardDraft so an in-flight save can tell it's been superseded
 * and must not resurrect a draft the customer just threw away. */
let generation = 0

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const probe = '__framengine_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function isPersistenceAvailable(): boolean {
  return getStorage() !== null && isAssetDbAvailable()
}

export type RestoreOutcome =
  | { status: 'none' }
  | { status: 'restored'; missingPhotos: number }
  | { status: 'discarded'; reason: string }

/** Removes the saved draft and every stored image. */
export async function discardDraft(): Promise<void> {
  generation += 1
  persistedAssets.clear()
  await clearOriginals()
  try {
    getStorage()?.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    /* nothing to remove */
  }
  if (isAssetDbAvailable()) {
    try {
      await clearAssets()
    } catch {
      /* a failed cleanup must never block starting over */
    }
  }
}

export async function restoreDraft(): Promise<RestoreOutcome> {
  const storage = getStorage()
  if (!storage || !isAssetDbAvailable()) return { status: 'none' }

  let raw: string | null
  try {
    raw = storage.getItem(DRAFT_STORAGE_KEY)
  } catch {
    return { status: 'none' }
  }
  if (raw === null) return { status: 'none' }

  const parsed = parseDraft(raw)
  if (!parsed.ok) {
    await discardDraft()
    return { status: 'discarded', reason: parsed.reason }
  }
  const draft = parsed.draft

  const createdUrls: string[] = []
  const linkedAssetIds = new Set<string>()
  const link = async (image: PersistedImage): Promise<UploadedImage | null> => {
    const blob = await getAsset(image.assetId)
    if (!blob) return null
    const src = URL.createObjectURL(blob)
    createdUrls.push(src)
    linkedAssetIds.add(image.assetId)
    return { ...image, src }
  }

  try {
    const wallImage = await link(draft.wall)
    if (!wallImage) {
      await discardDraft()
      return { status: 'discarded', reason: 'wall-missing' }
    }

    let missingPhotos = 0
    const frames: FrameInstance[] = []
    for (const frame of draft.frames) {
      let photo: PhotoAsset | null = null
      if (frame.photo) {
        photo = await link(frame.photo)
        if (!photo) missingPhotos += 1
      }
      frames.push({ ...frame, photo })
    }

    const wall: WallImage = wallImage
    useCompositionStore.getState().restoreComposition({
      wall,
      wallWidthCm: draft.wallWidthCm,
      frames,
      activeLayoutId: draft.activeLayoutId,
      activeProductId: draft.activeProductId,
      hasCustomProduct: draft.hasCustomProduct,
      placementMode: draft.placementMode,
      wallRegion: draft.wallRegion,
    })
    useJourneyStore.getState().restoreProgress(draft.currentStep as StepId, draft.furthestStep as StepId)

    persistedAssets.clear()
    for (const id of linkedAssetIds) persistedAssets.add(id)

    // Sweep images left behind by earlier sessions (best effort).
    void pruneOriginals(linkedAssetIds)
    try {
      const stale = (await listAssetIds()).filter((id) => !persistedAssets.has(id))
      await deleteAssets(stale)
    } catch {
      /* harmless leftovers */
    }
    return { status: 'restored', missingPhotos }
  } catch {
    // A storage read failed mid-restore. Keep the saved draft (the failure
    // may be transient) but release anything we linked.
    for (const url of createdUrls) URL.revokeObjectURL(url)
    return { status: 'discarded', reason: 'storage' }
  }
}

function findSrc(assetId: string): string | null {
  const { wall, frames } = useCompositionStore.getState()
  if (wall?.assetId === assetId) return wall.src
  for (const frame of frames) if (frame.photo?.assetId === assetId) return frame.photo.src
  // An asset only referenced by undo history isn't part of the draft.
  return null
}

/** Writes the current design. Throws if storage rejects it (quota, etc.). */
export async function saveDraftNow(): Promise<void> {
  const storage = getStorage()
  if (!storage || !isAssetDbAvailable()) return

  const composition = useCompositionStore.getState()
  if (!composition.wall) return // nothing to save; leaving any old draft alone is deliberate

  const startedGeneration = generation
  const journey = useJourneyStore.getState()
  const draft = serializeDraft({
    wall: composition.wall,
    wallWidthCm: composition.wallWidthCm,
    activeLayoutId: composition.activeLayoutId,
    activeProductId: composition.activeProductId,
    hasCustomProduct: composition.hasCustomProduct,
    placementMode: composition.placementMode,
    wallRegion: composition.wallRegion,
    frames: composition.frames,
    currentStep: journey.currentStep,
    furthestStep: journey.furthestStep,
  })
  const needed = draftAssetIds(draft)

  for (const assetId of needed) {
    if (persistedAssets.has(assetId)) continue
    const src = findSrc(assetId)
    if (!src) continue
    const blob = await (await fetch(src)).blob()
    await putAsset(assetId, blob)
    persistedAssets.add(assetId)
  }

  if (startedGeneration !== generation) return // discarded while we were writing
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))

  const stale = [...persistedAssets].filter((id) => !needed.includes(id))
  if (stale.length > 0) {
    await deleteAssets(stale)
    for (const id of stale) persistedAssets.delete(id)
  }
}

/** Saves automatically whenever the design (or the customer's place in the
 * flow) changes. Returns an unsubscribe function. */
export function startDraftAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue: Promise<void> = Promise.resolve()
  let warned = false

  const flush = async () => {
    try {
      await saveDraftNow()
      warned = false
    } catch {
      if (!warned) {
        warned = true
        useUIStore
          .getState()
          .pushNotice('info', `We couldn't save your progress in this browser. Keep this tab open until you're done.`)
      }
    }
  }

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      queue = queue.then(flush)
    }, SAVE_DEBOUNCE_MS)
  }

  const unsubscribeComposition = useCompositionStore.subscribe(schedule)
  // The journey store also ticks during before/after animation; only the
  // customer's step position is worth saving.
  const unsubscribeJourney = useJourneyStore.subscribe((state, previous) => {
    if (state.currentStep !== previous.currentStep || state.furthestStep !== previous.furthestStep) schedule()
  })

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribeComposition()
    unsubscribeJourney()
  }
}

/** Throws away the draft and returns every store to a blank slate. */
export async function startNewDesign(): Promise<void> {
  await discardDraft()
  useCompositionStore.getState().resetComposition()
  useUIStore.getState().resetUI()
  useJourneyStore.getState().resetJourney()
}
