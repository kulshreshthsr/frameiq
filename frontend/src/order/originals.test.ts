import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetAssetDbForTests } from '../persistence/assetDb'
import { clearOriginals, forgetOriginals, hasOriginal, loadOriginal, previewKey, pruneOriginals, resetOriginalsForTests, saveOriginal } from './originals'

// jsdom's Blob can't be structured-cloned by fake-indexeddb; Node's can.
const blob = (text: string) => new NodeBlob([text], { type: 'image/jpeg' }) as unknown as Blob
const text = async (b: Blob | null) => (b ? await (b as unknown as NodeBlob).text() : null)

beforeEach(async () => {
  await resetAssetDbForTests()
  await clearOriginals()
  resetOriginalsForTests()
})

describe('production originals', () => {
  it('keeps an original and hands the same bytes back', async () => {
    await saveOriginal('photo_1', blob('full resolution'))
    expect(await text(await loadOriginal('photo_1'))).toBe('full resolution')
    expect(await hasOriginal('photo_1')).toBe(true)
  })

  it('reports a missing original as missing — never a stand-in', async () => {
    expect(await loadOriginal('nope')).toBeNull()
    expect(await hasOriginal('nope')).toBe(false)
  })

  it('survives a refresh (memory gone, IndexedDB kept)', async () => {
    await saveOriginal('photo_1', blob('kept'))
    resetOriginalsForTests() // what a page reload does to memory
    expect(await text(await loadOriginal('photo_1'))).toBe('kept')
  })

  it('forgets originals on request', async () => {
    await saveOriginal('a', blob('a'))
    await saveOriginal('b', blob('b'))
    await forgetOriginals(['a'])
    resetOriginalsForTests()
    expect(await hasOriginal('a')).toBe(false)
    expect(await hasOriginal('b')).toBe(true)
  })

  it('prunes what the design no longer uses, but keeps the checkout preview', async () => {
    await saveOriginal('used', blob('u'))
    await saveOriginal('stale', blob('s'))
    await saveOriginal(previewKey('abc123'), blob('p'))
    await pruneOriginals(new Set(['used']))
    resetOriginalsForTests()
    expect(await hasOriginal('used')).toBe(true)
    expect(await hasOriginal('stale')).toBe(false)
    expect(await hasOriginal(previewKey('abc123'))).toBe(true)
  })

  it('clears everything when starting over', async () => {
    await saveOriginal('a', blob('a'))
    await clearOriginals()
    expect(await hasOriginal('a')).toBe(false)
  })
})
