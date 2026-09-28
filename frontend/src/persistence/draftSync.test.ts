import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makePhoto, makeWall, resetAllStores } from '../test/fixtures'
import { useCompositionStore } from '../state/compositionStore'
import { useJourneyStore } from '../state/journeyStore'
import { useUIStore } from '../state/uiStore'
import { deleteAssets, getAsset, listAssetIds, resetAssetDbForTests } from './assetDb'
import { DRAFT_STORAGE_KEY } from './draft'
import { discardDraft, restoreDraft, saveDraftNow, startDraftAutosave, startNewDesign } from './draftSync'

// jsdom's Blob can't be structured-cloned by fake-indexeddb; Node's can. The
// app itself only ever hands blobs from fetch() to IndexedDB, so this swaps
// nothing but the test's blob source.
const blobsBySrc = new Map<string, Blob>()
let blobCounter = 0

/** A wall/photo whose object URL resolves (via the stubbed fetch) to real bytes. */
function withBytes<T extends { src: string }>(image: T): T {
  blobCounter += 1
  blobsBySrc.set(image.src, new NodeBlob([`pixels-${blobCounter}`], { type: 'image/jpeg' }) as unknown as Blob)
  return image
}

const store = () => useCompositionStore.getState()

async function wipeDatabase() {
  await resetAssetDbForTests()
  for (const id of await listAssetIds().catch(() => [] as string[])) await deleteAssets([id])
}

beforeEach(async () => {
  resetAllStores()
  blobsBySrc.clear()
  localStorage.clear()
  vi.stubGlobal('fetch', async (src: string) => ({ blob: async () => blobsBySrc.get(src) }))
  await wipeDatabase()
  await discardDraft()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function buildDesign() {
  store().setWall(withBytes(makeWall()))
  store().applyLayout('three-minimal')
  const photo = withBytes(makePhoto(3000, 2000, 2))
  store().setFramePhoto(store().frames[0].id, photo)
  store().setWallWidthCm(410)
  useJourneyStore.getState().advanceTo(4)
  return { photo }
}

describe('save → restore round trip', () => {
  it('recovers the design after a refresh, including photos, scale and progress', async () => {
    const { photo } = buildDesign()
    await saveDraftNow()
    const before = store().frames.map((f) => ({ id: f.id, sizeId: f.sizeId, width: f.width }))

    // Simulate a refresh: every in-memory store is gone.
    resetAllStores()
    expect(store().wall).toBeNull()

    const outcome = await restoreDraft()
    expect(outcome).toEqual({ status: 'restored', missingPhotos: 0 })
    expect(store().wall).not.toBeNull()
    expect(store().wallWidthCm).toBe(410)
    expect(store().frames.map((f) => ({ id: f.id, sizeId: f.sizeId, width: f.width }))).toEqual(before)
    expect(store().frames[0].photo?.assetId).toBe(photo.assetId)
    expect(store().frames[0].photo?.sourceWidth).toBe(6000)
    expect(useJourneyStore.getState().currentStep).toBe(4)
    expect(useJourneyStore.getState().furthestStep).toBe(4)
  })

  it('re-links images to FRESH object URLs (the old ones died with the page)', async () => {
    buildDesign()
    const oldWallSrc = store().wall!.src
    await saveDraftNow()
    resetAllStores()
    await restoreDraft()
    expect(store().wall!.src).not.toBe(oldWallSrc)
    expect(store().wall!.src.startsWith('blob:')).toBe(true)
  })

  it('starts with clean undo history rather than a stale one', async () => {
    buildDesign()
    await saveDraftNow()
    resetAllStores()
    await restoreDraft()
    expect(store().past).toHaveLength(0)
    expect(store().future).toHaveLength(0)
  })

  it('restores a marked wall region and wall-surface placement', async () => {
    buildDesign()
    store().markWall()
    await saveDraftNow()
    resetAllStores()
    await restoreDraft()
    expect(store().placementMode).toBe('wall-surface')
    expect(store().wallRegion).not.toBeNull()
    expect(store().frames.every((f) => f.perspective)).toBe(true)
  })

  it('reports nothing to restore on a fresh browser', async () => {
    expect(await restoreDraft()).toEqual({ status: 'none' })
  })

  it('does not save an empty design (which would overwrite a recoverable one)', async () => {
    await saveDraftNow()
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })
})

describe('storage hygiene', () => {
  it('writes images before the JSON that references them', async () => {
    buildDesign()
    await saveDraftNow()
    const ids = await listAssetIds()
    expect(ids).toContain(store().wall!.assetId)
    expect(ids).toContain(store().frames[0].photo!.assetId)
  })

  it('deletes stored images once a design no longer uses them', async () => {
    const { photo } = buildDesign()
    await saveDraftNow()
    expect(await getAsset(photo.assetId)).not.toBeNull()
    store().removeFrame(store().frames[0].id)
    await saveDraftNow()
    expect(await getAsset(photo.assetId)).toBeNull()
  })

  it('re-saves an image that undo brought back after it was cleaned up', async () => {
    const { photo } = buildDesign()
    await saveDraftNow()
    store().removeFrame(store().frames[0].id)
    await saveDraftNow()
    expect(await getAsset(photo.assetId)).toBeNull()
    store().undo()
    await saveDraftNow()
    expect(await getAsset(photo.assetId)).not.toBeNull()
  })

  it('sweeps orphaned images left by an earlier session on restore', async () => {
    buildDesign()
    await saveDraftNow()
    const { putAsset } = await import('./assetDb')
    await putAsset('orphan_from_yesterday', new NodeBlob(['x']) as unknown as Blob)
    resetAllStores()
    await restoreDraft()
    expect(await listAssetIds()).not.toContain('orphan_from_yesterday')
  })
})

describe('recovering from damage', () => {
  it('discards a corrupted draft and cleans up instead of crashing', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, '{"version":1,"wall":')
    const outcome = await restoreDraft()
    expect(outcome.status).toBe('discarded')
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
    expect(store().wall).toBeNull()
  })

  it('discards a draft from a different version', async () => {
    buildDesign()
    await saveDraftNow()
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!)
    saved.version = 999
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(saved))
    resetAllStores()
    expect((await restoreDraft()).status).toBe('discarded')
  })

  it('discards the draft when the wall image is gone from storage', async () => {
    buildDesign()
    await saveDraftNow()
    await deleteAssets([store().wall!.assetId])
    resetAllStores()
    expect(await restoreDraft()).toEqual({ status: 'discarded', reason: 'wall-missing' })
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('keeps the design but drops a photo whose image is missing, and says how many', async () => {
    const { photo } = buildDesign()
    await saveDraftNow()
    await deleteAssets([photo.assetId])
    resetAllStores()
    const outcome = await restoreDraft()
    expect(outcome).toEqual({ status: 'restored', missingPhotos: 1 })
    expect(store().frames).toHaveLength(3)
    expect(store().frames[0].photo).toBeNull()
  })

  it('repairs stale product ids from an older catalog', async () => {
    buildDesign()
    await saveDraftNow()
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!)
    saved.frames[1].productId = 'retired'
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(saved))
    resetAllStores()
    expect((await restoreDraft()).status).toBe('restored')
    expect(store().frames[1].productId).toBe('natural-oak')
  })
})

describe('when browser storage is unavailable', () => {
  it('restore is a quiet no-op if localStorage throws (e.g. blocked cookies)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(await restoreDraft()).toEqual({ status: 'none' })
  })

  it('saving is a quiet no-op and the editor keeps working', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    buildDesign()
    await expect(saveDraftNow()).resolves.toBeUndefined()
    expect(store().frames).toHaveLength(3)
  })

  it('is a no-op when IndexedDB does not exist', async () => {
    vi.stubGlobal('indexedDB', undefined)
    buildDesign()
    await expect(saveDraftNow()).resolves.toBeUndefined()
    expect(await restoreDraft()).toEqual({ status: 'none' })
  })
})

describe('autosave', () => {
  it('saves shortly after the design changes', async () => {
    const stop = startDraftAutosave()
    buildDesign()
    await vi.waitFor(() => expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull(), { timeout: 3000 })
    stop()
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!)
    expect(saved.wallWidthCm).toBe(410)
  })

  it('debounces a burst of edits into few writes', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const stop = startDraftAutosave()
    store().setWall(withBytes(makeWall()))
    for (let i = 0; i < 25; i++) store().setWallWidthCm(200 + i)
    await new Promise((resolve) => setTimeout(resolve, 900))
    stop()
    const draftWrites = write.mock.calls.filter(([key]) => key === DRAFT_STORAGE_KEY)
    expect(draftWrites.length).toBeLessThanOrEqual(2)
  })

  it('tells the customer once — in plain words — if saving fails, and keeps working', async () => {
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === DRAFT_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, key, value)
    })
    const stop = startDraftAutosave()
    buildDesign()
    await vi.waitFor(() => expect(useUIStore.getState().notices.length).toBeGreaterThan(0), { timeout: 3000 })
    stop()
    const [notice] = useUIStore.getState().notices
    expect(notice.message).toMatch(/couldn't save your progress/i)
    expect(notice.message).not.toMatch(/quota|DOMException|error/i)
    expect(store().frames).toHaveLength(3)
  })

  it('does not write anything after it has been stopped', async () => {
    const stop = startDraftAutosave()
    stop()
    buildDesign()
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })
})

describe('starting a new design', () => {
  it('clears the draft, its images, and every store', async () => {
    buildDesign()
    await saveDraftNow()
    await startNewDesign()
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
    expect(await listAssetIds()).toEqual([])
    expect(store().wall).toBeNull()
    expect(store().frames).toHaveLength(0)
    expect(useJourneyStore.getState().currentStep).toBe(1)
  })

  it('a save that was in flight cannot resurrect the thrown-away draft', async () => {
    buildDesign()
    const saving = saveDraftNow()
    await startNewDesign()
    await saving.catch(() => {})
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('a fresh restore after starting over finds nothing', async () => {
    buildDesign()
    await saveDraftNow()
    await startNewDesign()
    expect(await restoreDraft()).toEqual({ status: 'none' })
  })
})
