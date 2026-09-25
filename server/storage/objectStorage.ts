import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * Where uploaded images (and production packages' copies of them) are kept.
 *
 * The rest of the server only knows this interface, so moving from the local
 * disk to object storage (S3, R2, GCS…) means writing one more class that
 * implements it — no other code changes. Keys are opaque, slash-separated
 * names like `uploads/ab/abcdef….jpg`.
 */
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer | null>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/i

function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.includes('//')) throw new Error(`Unsafe storage key: ${key}`)
}

/** Stores objects as files under a root directory. */
export class DiskStorage implements ObjectStorage {
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  private pathFor(key: string): string {
    assertSafeKey(key)
    const full = resolve(join(this.root, key))
    // Belt and braces: whatever the key, never leave the root directory.
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error(`Unsafe storage key: ${key}`)
    return full
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key))
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true })
  }
}

/** In-memory storage for tests. */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, Buffer>()

  async put(key: string, data: Buffer): Promise<void> {
    assertSafeKey(key)
    this.objects.set(key, Buffer.from(data))
  }

  async get(key: string): Promise<Buffer | null> {
    assertSafeKey(key)
    return this.objects.get(key) ?? null
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key)
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key)
  }
}
