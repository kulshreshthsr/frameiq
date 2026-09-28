import { beforeEach, describe, expect, it } from 'vitest'
import { chooseTargetFrames } from '../hooks/usePhotoUpload'
import { makePhoto, makeWall, resetAllStores } from '../test/fixtures'
import { useCompositionStore } from '../state/compositionStore'
import { MAX_FILE_SIZE_BYTES } from './constants'
import { UserFacingError, friendlyMessage } from './errors'
import { validateImageFile } from './imageValidation'
import { assessFramePhoto, commonValue } from './frameSelection'
import { describeDesign, describeFrame, frameName } from './frameLabels'

const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type })

describe('validateImageFile', () => {
  it('accepts JPG, PNG and WEBP', () => {
    for (const [name, type] of [['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp'], ['A.JPEG', 'image/jpeg']]) {
      expect(validateImageFile(file(name, type)).ok).toBe(true)
    }
  })

  it('accepts a file with a right extension but a blank mime type (some phones report none)', () => {
    expect(validateImageFile(file('IMG_1.jpg', '')).ok).toBe(true)
  })

  it('rejects other types with a plain-language message', () => {
    const result = validateImageFile(file('notes.txt', 'text/plain'))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/JPG, PNG or WEBP/)
    expect(result.error).not.toMatch(/mime|extension|exception/i)
  })

  it('rejects an empty file, and one over the size limit — naming the limit', () => {
    expect(validateImageFile(file('a.jpg', 'image/jpeg', 0))).toMatchObject({ ok: false })
    const big = validateImageFile({ name: 'big.jpg', type: 'image/jpeg', size: MAX_FILE_SIZE_BYTES + 1 } as File)
    expect(big.ok).toBe(false)
    expect(big.error).toContain(`${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`)
  })

  it('does not trust a mime type over an unsupported extension', () => {
    expect(validateImageFile(file('image.gif', 'image/gif')).ok).toBe(false)
  })
})

describe('friendlyMessage', () => {
  it('shows our own customer-facing errors verbatim', () => {
    expect(friendlyMessage(new UserFacingError('Try a smaller photo.'))).toBe('Try a smaller photo.')
  })

  it('never leaks a raw error, whatever it is', () => {
    for (const raw of [new TypeError("Cannot read properties of undefined (reading 'x')"), new DOMException('QuotaExceededError'), 'boom', null, { message: 'internal' }]) {
      const message = friendlyMessage(raw)
      expect(message).toBe('Something went wrong. Please try again.')
    }
  })

  it('uses a caller-supplied fallback', () => {
    expect(friendlyMessage(new Error('x'), 'Custom')).toBe('Custom')
  })
})

describe('chooseTargetFrames', () => {
  beforeEach(() => {
    resetAllStores()
    const store = useCompositionStore.getState()
    store.setWall(makeWall())
    store.applyLayout('six-family')
  })

  const frames = () => useCompositionStore.getState().frames

  it('sends a single photo to the chosen frame, replacing what is there', () => {
    useCompositionStore.getState().setFramePhoto(frames()[2].id, makePhoto())
    const targets = chooseTargetFrames(frames(), frames()[2].id, 1)
    expect(targets.map((f) => f.id)).toEqual([frames()[2].id])
  })

  it('fills empty frames in order, starting at the chosen one', () => {
    const targets = chooseTargetFrames(frames(), frames()[3].id, 3)
    expect(targets[0].id).toBe(frames()[3].id)
    expect(targets).toHaveLength(6) // the chosen empty frame first, then every other empty one
    expect(new Set(targets.map((f) => f.id)).size).toBe(6)
  })

  it('skips frames that already have photos when filling', () => {
    useCompositionStore.getState().setFramePhoto(frames()[0].id, makePhoto())
    const targets = chooseTargetFrames(frames(), frames()[1].id, 4)
    expect(targets.map((f) => f.id)).not.toContain(frames()[0].id)
    expect(targets).toHaveLength(5)
  })

  it('offers nothing when every frame is full and several photos arrive', () => {
    frames().forEach((f) => useCompositionStore.getState().setFramePhoto(f.id, makePhoto()))
    expect(chooseTargetFrames(frames(), frames()[0].id, 3)).toEqual([])
  })

  it('with nothing selected, fills from the first empty frame', () => {
    const targets = chooseTargetFrames(frames(), null, 2)
    expect(targets[0].id).toBe(frames()[0].id)
  })
})

describe('frame selection helpers', () => {
  beforeEach(() => {
    resetAllStores()
    useCompositionStore.getState().setWall(makeWall())
    useCompositionStore.getState().applyLayout('three-minimal')
  })
  const frames = () => useCompositionStore.getState().frames

  it('commonValue returns the shared value, or null when frames differ or there are none', () => {
    expect(commonValue(frames(), (f) => f.productId)).toBe(frames()[0].productId)
    useCompositionStore.getState().configureFrames(frames()[0].id, { productId: 'gold' })
    expect(commonValue(frames(), (f) => f.productId)).toBeNull()
    expect(commonValue([], (f) => f.productId)).toBeNull()
  })

  it('assessFramePhoto is null without a photo, and warns when a small photo is stretched over a big frame', () => {
    expect(assessFramePhoto(frames()[0])).toBeNull()
    const id = frames()[0].id
    useCompositionStore.getState().configureFrames(id, { sizeId: '24x36' })
    useCompositionStore.getState().setFramePhoto(id, makePhoto(640, 480, 1))
    expect(assessFramePhoto(frames()[0])?.quality).toBe('low')
  })

  it('a large original prints sharply even though the working copy is small', () => {
    const id = frames()[0].id
    useCompositionStore.getState().configureFrames(id, { sizeId: '12x18' })
    useCompositionStore.getState().setFramePhoto(id, makePhoto(2560, 1920, 3.5)) // 9000px original
    expect(assessFramePhoto(frames()[0])?.quality).toBe('good')
  })
})

describe('frame labels (screen-reader text)', () => {
  beforeEach(() => {
    resetAllStores()
    useCompositionStore.getState().setWall(makeWall())
  })

  it('names frames by number', () => {
    expect(frameName(0)).toBe('Frame 1')
  })

  it('describes a frame in words, including its photo state', () => {
    const [frame] = useCompositionStore.getState().frames
    expect(describeFrame(frame, 0)).toMatch(/^Frame 1: .+, \d+ × \d+ in, no photo yet$/)
    useCompositionStore.getState().setFramePhoto(frame.id, makePhoto())
    expect(describeFrame(useCompositionStore.getState().frames[0], 0)).toMatch(/photo added$/)
  })

  it('summarises the whole design', () => {
    expect(describeDesign([])).toMatch(/no frames/)
    expect(describeDesign(useCompositionStore.getState().frames)).toBe('Your wall with 1 frame; 0 of 1 have photos.')
  })
})
