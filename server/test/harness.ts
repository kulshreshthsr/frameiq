import { createClient } from '@libsql/client'
import { canonicalJson } from '../../shared/canonical.ts'
import { SEED_CATALOG } from '../../shared/catalogSeed.ts'
import { defaultGlassId, defaultMatId, findProduct, findSize, type Catalog } from '../../shared/catalog.ts'
import { DESIGN_SNAPSHOT_VERSION, type CreateOrderRequest, type DesignSnapshot } from '../../shared/orderSchema.ts'
import { computeOrderTotals } from '../../shared/pricing.ts'
import { createApp } from '../app.ts'
import { saveCatalog } from '../catalog/catalogRepo.ts'
import { loadConfig, type Config } from '../config.ts'
import type { AppContext } from '../context.ts'
import { guardDb, migrate } from '../db/client.ts'
import { memoryLogger, type LogRecord } from '../log.ts'
import { LogNotifier } from '../notifications/notifier.ts'
import { SandboxProvider } from '../payments/sandbox.ts'
import { MemoryStorage } from '../storage/objectStorage.ts'
import { storeUpload } from '../uploads/service.ts'
import { jpegBytes, pngBytes } from './images.ts'

/**
 * A complete, isolated server for tests: in-memory database, in-memory
 * storage, a clock the test controls, deterministic ids, and the sandbox
 * payment provider. `app.request(...)` exercises the real HTTP layer with no
 * network.
 */

export interface TestServer {
  ctx: AppContext
  app: ReturnType<typeof createApp>
  storage: MemoryStorage
  packages: MemoryStorage
  logs: LogRecord[]
  sandbox: SandboxProvider
  clock: { now: Date }
  config: Config
}

export const SANDBOX_SECRET = 'test-sandbox-secret'

export async function createTestServer(configOverrides: Record<string, string> = {}): Promise<TestServer> {
  const config = loadConfig({ FRAMENGINE_ENV: 'test', RATE_LIMIT: 'off', SANDBOX_WEBHOOK_SECRET: SANDBOX_SECRET, STATIC_DIR: '', ...configOverrides })
  const db = guardDb(createClient({ url: 'file::memory:' }))
  await db.execute('PRAGMA foreign_keys = ON')
  await migrate(db)
  await saveCatalog(db, SEED_CATALOG)

  const { logger, records } = memoryLogger()
  const clock = { now: new Date('2026-03-15T10:00:00.000Z') }
  let counter = 0
  const randomId = (bytes = 16) => String(++counter).padStart(Math.max(bytes, 6), '0')
  const storage = new MemoryStorage()
  const packages = new MemoryStorage()
  const sandbox = new SandboxProvider(SANDBOX_SECRET, randomId)

  const ctx: AppContext = {
    config,
    db,
    storage,
    packageStorage: packages,
    log: logger,
    payments: sandbox,
    notifier: new LogNotifier(logger),
    now: () => new Date(clock.now),
    randomId,
  }
  return { ctx, app: createApp(ctx), storage, packages, logs: records, sandbox, clock, config }
}

// ---------------------------------------------------------------- requests

export interface Api {
  get(path: string, headers?: Record<string, string>): Promise<Response>
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>
}

export function apiFor(server: TestServer): Api {
  return {
    get: (path, headers) => Promise.resolve(server.app.request(path, { headers })),
    post: (path, body, headers) =>
      Promise.resolve(
        server.app.request(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      ),
  }
}

// ---------------------------------------------------------------- order building

export interface FrameSpec {
  productId?: string
  sizeId?: string
  glassId?: string
  matId?: string
  orientation?: 'portrait' | 'landscape'
  /** Original photo dimensions; null = an empty frame. */
  photo?: { width: number; height: number } | null
}

export interface BuiltOrder {
  body: CreateOrderRequest
  snapshot: DesignSnapshot
  totals: ReturnType<typeof computeOrderTotals>
  accessToken: string
  idempotencyKey: string
}

const TOKEN = 'T'.repeat(43)

/** A crop that shows the middle of a photo at the frame's aspect ratio. */
function centredCrop(photo: { width: number; height: number }, opening: { width: number; height: number }) {
  const frameAspect = opening.width / opening.height
  const photoAspect = photo.width / photo.height
  if (photoAspect > frameAspect) {
    const w = frameAspect / photoAspect
    return { x: (1 - w) / 2, y: 0, width: w, height: 1, rotationDeg: 0 as const }
  }
  const h = photoAspect / frameAspect
  return { x: 0, y: (1 - h) / 2, width: 1, height: h, rotationDeg: 0 as const }
}

/**
 * Builds a valid order request: uploads the images it needs, computes the
 * correct totals from the catalog, and returns everything a test might tweak.
 */
export async function buildOrder(server: TestServer, frames: FrameSpec[] = [{}], overrides: { catalog?: Catalog; key?: string; token?: string } = {}): Promise<BuiltOrder> {
  const catalog = overrides.catalog ?? SEED_CATALOG
  const wall = await storeUpload(server.ctx, jpegBytes(1600, 1200, undefined, 11))
  const preview = await storeUpload(server.ctx, pngBytes(1600, 1200, 13))
  const photos: Record<string, string> = {}

  const snapshotFrames = await Promise.all(
    frames.map(async (spec, index) => {
      const productId = spec.productId ?? 'walnut'
      const product = findProduct(catalog, productId)!
      const size = findSize(catalog, productId, spec.sizeId ?? '12x18')!
      const orientation = spec.orientation ?? 'portrait'
      const sizeIn = orientation === 'landscape' ? { width: size.height, height: size.width } : { width: size.width, height: size.height }
      const openingIn = { width: sizeIn.width * 0.8, height: sizeIn.height * 0.8 }
      const spec_photo = spec.photo === undefined ? { width: 3000, height: 4500 } : spec.photo
      let photo = null
      if (spec_photo) {
        // A distinct file per frame (the extra padding differs), as real uploads are.
        const upload = await storeUpload(server.ctx, jpegBytes(spec_photo.width, spec_photo.height, undefined, 100 + index))
        const assetId = `asset_${index + 1}`
        photos[assetId] = upload.uploadId
        photo = {
          asset: { assetId, width: 1200, height: Math.round((1200 * spec_photo.height) / spec_photo.width), sourceWidth: spec_photo.width, sourceHeight: spec_photo.height },
          transform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
          crop: centredCrop(spec_photo, openingIn),
        }
      }
      return {
        id: `frame_${index + 1}`,
        slotId: `slot_${index + 1}`,
        number: index + 1,
        productId: product.id,
        sizeId: size.id,
        orientation,
        glassId: spec.glassId ?? defaultGlassId(catalog, product),
        matId: spec.matId ?? defaultMatId(catalog, product),
        anchor: { xPct: 0.5, yPct: 0.5 },
        tilt: 0,
        sizeIn,
        openingIn,
        geometry: { x: 600, y: 450, width: 300, height: 450, rotation: 0 },
        photo,
      }
    }),
  )

  const totals = computeOrderTotals(catalog, snapshotFrames)
  const itemMap = new Map<string, { productId: string; sizeId: string; glassId: string; matId: string; quantity: number }>()
  for (const f of snapshotFrames) {
    const key = [f.productId, f.sizeId, f.glassId, f.matId].join('|')
    const item = itemMap.get(key) ?? { productId: f.productId, sizeId: f.sizeId, glassId: f.glassId, matId: f.matId, quantity: 0 }
    item.quantity += 1
    itemMap.set(key, item)
  }

  const snapshot: DesignSnapshot = {
    schemaVersion: DESIGN_SNAPSHOT_VERSION,
    app: { name: 'framengine', version: '0.0.0-test', catalogVersion: catalog.version },
    createdAt: server.clock.now.toISOString(),
    wall: { asset: { assetId: 'wall_1', width: 1600, height: 1200, sourceWidth: 1600, sourceHeight: 1200 }, widthCm: 300, placementMode: 'free', region: null },
    layoutId: 'single-hero',
    frames: snapshotFrames,
    items: [...itemMap.values()],
    pricing: { currency: totals.currency, subtotalMinor: totals.subtotalMinor, deliveryFeeMinor: totals.deliveryFeeMinor, totalMinor: totals.totalMinor },
  }

  const accessToken = overrides.token ?? TOKEN
  const body: CreateOrderRequest = {
    snapshot,
    customer: { name: 'Asha Rao', mobile: '98765 43210' },
    delivery: { line1: '12 MG Road, Indiranagar', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560038' },
    accessToken,
    uploads: { wall: wall.uploadId, preview: preview.uploadId, photos },
  }
  return { body, snapshot, totals, accessToken, idempotencyKey: overrides.key ?? 'idem-key-0000000001' }
}

/** POSTs a built order and returns the parsed response. */
export async function placeOrder(server: TestServer, built: BuiltOrder) {
  const api = apiFor(server)
  const res = await api.post('/api/orders', built.body, { 'Idempotency-Key': built.idempotencyKey })
  return { res, json: (await res.json()) as any }
}

export const orderHeaders = (token: string) => ({ 'X-Order-Token': token })

export { canonicalJson }
