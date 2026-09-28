// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DiskStorage, MemoryStorage, type ObjectStorage } from './objectStorage.ts'

const implementations: [string, () => Promise<{ storage: ObjectStorage; cleanup: () => Promise<void> }>][] = [
  ['DiskStorage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'framengine-storage-'))
    return { storage: new DiskStorage(dir), cleanup: () => rm(dir, { recursive: true, force: true }) }
  }],
  ['MemoryStorage', async () => ({ storage: new MemoryStorage(), cleanup: async () => {} })],
]

describe.each(implementations)('%s (same contract, so a cloud implementation can replace it)', (_name, make) => {
  let storage: ObjectStorage
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    ;({ storage, cleanup } = await make())
  })
  afterEach(() => cleanup())

  it('stores and retrieves bytes exactly', async () => {
    const data = Buffer.from([0, 1, 2, 250, 251, 252])
    await storage.put('uploads/ab/file.jpg', data, 'image/jpeg')
    expect((await storage.get('uploads/ab/file.jpg'))!.equals(data)).toBe(true)
    expect(await storage.exists('uploads/ab/file.jpg')).toBe(true)
  })

  it('reports a missing object as absent, not as an error', async () => {
    expect(await storage.get('uploads/nope.jpg')).toBeNull()
    expect(await storage.exists('uploads/nope.jpg')).toBe(false)
  })

  it('overwrites and deletes', async () => {
    await storage.put('a/b.png', Buffer.from('one'), 'image/png')
    await storage.put('a/b.png', Buffer.from('two'), 'image/png')
    expect((await storage.get('a/b.png'))!.toString()).toBe('two')
    await storage.delete('a/b.png')
    expect(await storage.get('a/b.png')).toBeNull()
    await storage.delete('a/b.png') // deleting twice is fine
  })

  it.each(['../escape.txt', '../../etc/passwd', 'a/../../b', '/absolute/path', 'a//b', 'a\b', '', ' spaced', 'a/b\0c'])('refuses the unsafe key %j', async (key) => {
    await expect(storage.put(key, Buffer.from('x'), 'text/plain')).rejects.toThrow(/Unsafe storage key/)
    await expect(storage.get(key)).rejects.toThrow(/Unsafe storage key/)
  })
})
