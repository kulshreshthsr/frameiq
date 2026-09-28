import { beforeEach, describe, expect, it } from 'vitest'
import { makePhoto, makeWall, resetAllStores } from '../test/fixtures'
import { useCompositionStore } from '../state/compositionStore'
import { DRAFT_VERSION, draftAssetIds, parseDraft, serializeDraft, type Draft, type DraftSource } from './draft'

function currentSource(): DraftSource {
  const s = useCompositionStore.getState()
  return {
    wall: s.wall!,
    wallWidthCm: s.wallWidthCm,
    activeLayoutId: s.activeLayoutId,
    activeProductId: s.activeProductId,
    hasCustomProduct: s.hasCustomProduct,
    placementMode: s.placementMode,
    wallRegion: s.wallRegion,
    frames: s.frames,
    currentStep: 3,
    furthestStep: 4,
  }
}

/** JSON as it would come back from storage, ready for surgical corruption. */
function savedJson(mutate?: (draft: Record<string, any>) => void): string {
  const draft = JSON.parse(JSON.stringify(serializeDraft(currentSource(), 1000)))
  mutate?.(draft)
  return JSON.stringify(draft)
}

beforeEach(() => {
  resetAllStores()
  const store = useCompositionStore.getState()
  store.setWall(makeWall())
  store.applyLayout('three-minimal')
  store.setFramePhoto(useCompositionStore.getState().frames[0].id, makePhoto(3000, 2000, 2))
  store.setWallWidthCm(350)
})

describe('serializeDraft', () => {
  it('never puts a blob URL in the saved JSON (they die on refresh)', () => {
    const json = JSON.stringify(serializeDraft(currentSource()))
    expect(json).not.toContain('blob:')
  })

  it('records images by asset id, with their original pixel size', () => {
    const draft = serializeDraft(currentSource())
    expect(draft.frames[0].photo).toMatchObject({ sourceWidth: 6000, sourceHeight: 4000 })
    expect(draftAssetIds(draft)).toHaveLength(2) // the wall and one photo
  })
})

describe('parseDraft — round trip', () => {
  it('reads back what was written', () => {
    const result = parseDraft(savedJson())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const source = currentSource()
    expect(result.draft.wallWidthCm).toBe(350)
    expect(result.draft.frames).toHaveLength(3)
    expect(result.draft.frames.map((f) => f.id)).toEqual(source.frames.map((f) => f.id))
    expect(result.draft.frames[0].photo?.assetId).toBe(source.frames[0].photo!.assetId)
    expect(result.draft.currentStep).toBe(3)
    expect(result.draft.furthestStep).toBe(4)
  })

  it('preserves a marked wall region and wall-surface mode', () => {
    useCompositionStore.getState().markWall()
    const result = parseDraft(savedJson())
    expect(result.ok && result.draft.placementMode).toBe('wall-surface')
    expect(result.ok && result.draft.wallRegion).not.toBeNull()
  })
})

describe('parseDraft — refusing bad input', () => {
  // Thunks, so the truncated case is built after beforeEach has made a design.
  it.each<[string, () => string | null]>([
    ['null', () => null],
    ['empty string', () => ''],
    ['not JSON', () => '{oops'],
    ['truncated JSON', () => savedJson().slice(0, 100)],
    ['a JSON array', () => '[]'],
    ['a JSON string', () => '"hello"'],
    ['a number', () => '42'],
  ])('rejects %s without throwing', (_label, raw) => {
    expect(parseDraft(raw()).ok).toBe(false)
  })

  it('rejects an unknown version (written by a different build)', () => {
    expect(parseDraft(savedJson((d) => (d.version = DRAFT_VERSION + 1)))).toEqual({ ok: false, reason: 'version' })
  })

  it('rejects a draft with no usable wall', () => {
    expect(parseDraft(savedJson((d) => delete d.wall)).ok).toBe(false)
    expect(parseDraft(savedJson((d) => (d.wall.width = -1))).ok).toBe(false)
    expect(parseDraft(savedJson((d) => (d.wall.assetId = ''))).ok).toBe(false)
  })

  it('rejects a draft whose frames are malformed, rather than half-loading it', () => {
    expect(parseDraft(savedJson((d) => (d.frames = 'nope'))).ok).toBe(false)
    expect(parseDraft(savedJson((d) => (d.frames[1].width = 'wide'))).ok).toBe(false)
    expect(parseDraft(savedJson((d) => (d.frames[0].x = null))).ok).toBe(false)
    expect(parseDraft(savedJson((d) => (d.frames[0].photoTransform.scale = 0))).ok).toBe(false)
    expect(parseDraft(savedJson((d) => (d.frames[0].anchor = 5))).ok).toBe(false)
  })

  it('rejects NaN/Infinity smuggled in as numbers', () => {
    // JSON can't carry NaN, but a string that looks numeric must not pass either.
    expect(parseDraft(savedJson((d) => (d.frames[0].tilt = '4'))).ok).toBe(false)
  })

  it('rejects an absurd number of frames', () => {
    const many = (d: Record<string, any>) => (d.frames = Array.from({ length: 200 }, () => d.frames[0]))
    expect(parseDraft(savedJson(many)).ok).toBe(false)
  })
})

describe('parseDraft — repairing stale but well-formed input', () => {
  const parsed = (mutate: (d: Record<string, any>) => void): Draft => {
    const result = parseDraft(savedJson(mutate))
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    return result.draft
  }

  it('maps a retired product to a sellable one', () => {
    const draft = parsed((d) => {
      d.frames[0].productId = 'discontinued'
      d.activeProductId = 'discontinued'
    })
    expect(draft.frames[0].productId).toBe('natural-oak')
    expect(draft.activeProductId).toBe('natural-oak')
  })

  it('defaults invalid orientation/glass/mat values', () => {
    const draft = parsed((d) => {
      d.frames[0].orientation = 'diagonal'
      d.frames[0].glassId = 'bulletproof'
      d.frames[0].matId = 'gold-leaf'
    })
    expect(draft.frames[0]).toMatchObject({ orientation: 'portrait', glassId: 'standard', matId: 'none' })
  })

  it('drops a broken photo but keeps the frame', () => {
    const draft = parsed((d) => (d.frames[0].photo = { assetId: 42 }))
    expect(draft.frames).toHaveLength(3)
    expect(draft.frames[0].photo).toBeNull()
  })

  it('falls back to free placement when the marked wall has collapsed to nothing', () => {
    useCompositionStore.getState().markWall()
    const draft = parsed((d) => {
      const p = { x: 10, y: 10 }
      d.wallRegion = { topLeft: p, topRight: p, bottomRight: p, bottomLeft: p }
    })
    expect(draft.placementMode).toBe('free')
    expect(draft.wallRegion).toBeNull()
  })

  it('falls back to free placement when wall-surface mode has no region', () => {
    const draft = parsed((d) => {
      d.placementMode = 'wall-surface'
      d.wallRegion = null
    })
    expect(draft.placementMode).toBe('free')
  })

  it('sanitizes an invalid wall width', () => {
    expect(parsed((d) => (d.wallWidthCm = -20)).wallWidthCm).toBe(300)
    expect(parsed((d) => (d.wallWidthCm = 'wide')).wallWidthCm).toBe(300)
  })

  it('clamps out-of-range journey steps', () => {
    const draft = parsed((d) => {
      d.currentStep = 99
      d.furthestStep = -3
    })
    expect(draft.currentStep).toBeLessThanOrEqual(6)
    expect(draft.furthestStep).toBeGreaterThanOrEqual(1)
  })

  it('ignores unknown extra keys', () => {
    const draft = parsed((d) => (d.somethingNew = { a: 1 }))
    expect('somethingNew' in draft).toBe(false)
  })

  it('treats a photo without original dimensions as its working size', () => {
    const draft = parsed((d) => {
      delete d.frames[0].photo.sourceWidth
      delete d.frames[0].photo.sourceHeight
    })
    expect(draft.frames[0].photo!.sourceWidth).toBe(draft.frames[0].photo!.width)
  })
})
