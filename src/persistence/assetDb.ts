/**
 * Image blobs in IndexedDB. localStorage is far too small for photos (and
 * stores only strings), and blob: URLs die on refresh — so the pixels live
 * here and are re-linked to fresh object URLs on restore.
 *
 * Two object stores, deliberately separate:
 *   - 'assets'    EDITOR images — downsized working copies the canvas draws.
 *   - 'originals' PRODUCTION images — the customer's full-resolution originals
 *                 (and the final design preview), needed only at order time.
 * Keeping them apart means cleaning up one can never disturb the other.
 */

const DB_NAME = 'framengine'
const DB_VERSION = 2

export type StoreName = 'assets' | 'originals'
const STORES: StoreName[] = ['assets', 'originals']

interface AssetRecord {
  id: string
  blob: Blob
  savedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

export function isAssetDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isAssetDbAvailable()) {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      // Runs for a fresh database and for one upgraded from version 1 (which
      // only had 'assets'): create whichever stores are missing.
      for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB open blocked'))
  }).catch((error) => {
    // Don't cache a failed open: a later attempt may succeed (e.g. after the
    // user frees space or leaves a private window).
    dbPromise = null
    throw error
  })
  return dbPromise
}

function run<T>(store: StoreName, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = work(tx.objectStore(store))
        let result: T
        request.onsuccess = () => {
          result = request.result
        }
        // Resolve on transaction completion, not request success, so a
        // write is durable before the caller proceeds.
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error ?? request.error ?? new Error('IndexedDB transaction failed'))
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
      }),
  )
}

export async function putAsset(id: string, blob: Blob, store: StoreName = 'assets'): Promise<void> {
  const record: AssetRecord = { id, blob, savedAt: Date.now() }
  await run(store, 'readwrite', (s) => s.put(record))
}

export async function getAsset(id: string, store: StoreName = 'assets'): Promise<Blob | null> {
  const record = await run<AssetRecord | undefined>(store, 'readonly', (s) => s.get(id))
  return record?.blob ?? null
}

export async function deleteAssets(ids: readonly string[], store: StoreName = 'assets'): Promise<void> {
  if (ids.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const objectStore = tx.objectStore(store)
    for (const id of ids) objectStore.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'))
  })
}

export async function listAssetIds(store: StoreName = 'assets'): Promise<string[]> {
  const keys = await run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys())
  return keys.map(String)
}

/** Empties one store, or — with no argument — every store. */
export async function clearAssets(store?: StoreName): Promise<void> {
  for (const name of store ? [store] : STORES) await run(name, 'readwrite', (s) => s.clear())
}

/** Test seam: forget the cached connection so a fresh fake database is used. */
export async function resetAssetDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      ;(await dbPromise).close()
    } catch {
      /* already failed */
    }
  }
  dbPromise = null
}
