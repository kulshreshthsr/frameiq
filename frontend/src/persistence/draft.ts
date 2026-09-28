import type { FrameInstance, PerspectiveCorners, PhotoTransform, UploadedImage, WallImage } from '../types/frame'
import type { PlacementMode } from '../domain/placement'
import { DEFAULT_PRODUCT_ID, defaultGlassFor, defaultMatFor, getProduct, hasProduct, type Orientation } from '../domain/catalog'
import { sanitizeWallWidthCm } from '../domain/sizing'

/**
 * The saved-draft format and its validation. This file is pure (no storage,
 * no DOM), so the exact shape — and everything that can go wrong reading it
 * back — is unit-testable.
 *
 * Readers never trust what they find: a draft can be truncated, edited,
 * written by an older build, or reference products that no longer exist.
 * `parseDraft` either returns a fully valid, repaired draft or refuses it.
 */

export const DRAFT_VERSION = 1
export const DRAFT_STORAGE_KEY = 'framengine.draft'
const MAX_FRAMES = 24

/** An image as saved: its pixels live in IndexedDB under `assetId`. */
export interface PersistedImage {
  assetId: string
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
}

export type PersistedFrame = Omit<FrameInstance, 'photo'> & { photo: PersistedImage | null }

export interface Draft {
  version: typeof DRAFT_VERSION
  savedAt: number
  wall: PersistedImage
  wallWidthCm: number
  activeLayoutId: string
  activeProductId: string
  hasCustomProduct: boolean
  placementMode: PlacementMode
  wallRegion: PerspectiveCorners | null
  frames: PersistedFrame[]
  currentStep: number
  furthestStep: number
}

export interface DraftSource {
  wall: WallImage
  wallWidthCm: number
  activeLayoutId: string
  activeProductId: string
  hasCustomProduct: boolean
  placementMode: PlacementMode
  wallRegion: PerspectiveCorners | null
  frames: FrameInstance[]
  currentStep: number
  furthestStep: number
}

export type ParseResult = { ok: true; draft: Draft } | { ok: false; reason: string }

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

function persistImage(image: UploadedImage): PersistedImage {
  return {
    assetId: image.assetId,
    width: image.width,
    height: image.height,
    sourceWidth: image.sourceWidth,
    sourceHeight: image.sourceHeight,
  }
}

export function serializeDraft(source: DraftSource, now: number = Date.now()): Draft {
  return {
    version: DRAFT_VERSION,
    savedAt: now,
    wall: persistImage(source.wall),
    wallWidthCm: source.wallWidthCm,
    activeLayoutId: source.activeLayoutId,
    activeProductId: source.activeProductId,
    hasCustomProduct: source.hasCustomProduct,
    placementMode: source.placementMode,
    wallRegion: source.wallRegion,
    frames: source.frames.map((frame) => ({ ...frame, photo: frame.photo ? persistImage(frame.photo) : null })),
    currentStep: source.currentStep,
    furthestStep: source.furthestStep,
  }
}

/** Every asset id a draft needs. */
export function draftAssetIds(draft: Draft): string[] {
  const ids = new Set<string>([draft.wall.assetId])
  for (const frame of draft.frames) if (frame.photo) ids.add(frame.photo.assetId)
  return [...ids]
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v: unknown): v is number => isNum(v) && v > 0
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function parseImage(value: unknown): PersistedImage | null {
  if (!isRecord(value)) return null
  if (!isString(value.assetId) || !isPositive(value.width) || !isPositive(value.height)) return null
  return {
    assetId: value.assetId,
    width: value.width,
    height: value.height,
    sourceWidth: isPositive(value.sourceWidth) ? value.sourceWidth : value.width,
    sourceHeight: isPositive(value.sourceHeight) ? value.sourceHeight : value.height,
  }
}

function parsePoint(value: unknown): { x: number; y: number } | null {
  return isRecord(value) && isNum(value.x) && isNum(value.y) ? { x: value.x, y: value.y } : null
}

function parseQuad(value: unknown): PerspectiveCorners | null {
  if (!isRecord(value)) return null
  const topLeft = parsePoint(value.topLeft)
  const topRight = parsePoint(value.topRight)
  const bottomRight = parsePoint(value.bottomRight)
  const bottomLeft = parsePoint(value.bottomLeft)
  return topLeft && topRight && bottomRight && bottomLeft ? { topLeft, topRight, bottomRight, bottomLeft } : null
}

/** Shoelace area — a region that collapsed to a line/point is unusable. */
function quadArea(q: PerspectiveCorners): number {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft]
  let sum = 0
  for (let i = 0; i < 4; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

function parsePhotoTransform(value: unknown): PhotoTransform | null {
  if (!isRecord(value)) return null
  if (!isNum(value.offsetX) || !isNum(value.offsetY) || !isPositive(value.scale) || !isNum(value.rotation)) return null
  return { offsetX: value.offsetX, offsetY: value.offsetY, scale: value.scale, rotation: value.rotation }
}

const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape']

function parseFrame(value: unknown): PersistedFrame | null {
  if (!isRecord(value)) return null
  if (!isString(value.id) || !isString(value.slotId)) return null
  if (!isRecord(value.anchor) || !isNum(value.anchor.xPct) || !isNum(value.anchor.yPct)) return null
  if (!isNum(value.tilt)) return null
  if (!isNum(value.x) || !isNum(value.y) || !isPositive(value.width) || !isPositive(value.height) || !isNum(value.rotation)) return null

  const photoTransform = parsePhotoTransform(value.photoTransform)
  if (!photoTransform) return null

  // A photo that fails to parse is dropped (the frame survives, empty) rather
  // than throwing away the whole draft.
  const photo = value.photo === null ? null : parseImage(value.photo)
  const perspective = value.perspective === undefined ? undefined : (parseQuad(value.perspective) ?? undefined)

  // Stale-but-well-formed ids are repaired to something sellable.
  const productId = isString(value.productId) && hasProduct(value.productId) ? value.productId : DEFAULT_PRODUCT_ID
  const product = getProduct(productId)

  return {
    id: value.id,
    slotId: value.slotId,
    anchor: { xPct: value.anchor.xPct, yPct: value.anchor.yPct },
    tilt: value.tilt,
    productId,
    sizeId: isString(value.sizeId) ? value.sizeId : '12x18',
    orientation: ORIENTATIONS.includes(value.orientation as Orientation) ? (value.orientation as Orientation) : 'portrait',
    glassId: isString(value.glassId) && product.glassOptionIds.includes(value.glassId) ? value.glassId : defaultGlassFor(product),
    matId: isString(value.matId) && product.matOptionIds.includes(value.matId) ? value.matId : defaultMatFor(product),
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation: value.rotation,
    perspective,
    photo,
    photoTransform,
  }
}

export function parseDraft(raw: string | null): ParseResult {
  if (raw === null || raw === '') return { ok: false, reason: 'empty' }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (!isRecord(data)) return { ok: false, reason: 'corrupt' }
  if (data.version !== DRAFT_VERSION) return { ok: false, reason: 'version' }

  const wall = parseImage(data.wall)
  if (!wall) return { ok: false, reason: 'wall' }
  if (!Array.isArray(data.frames) || data.frames.length > MAX_FRAMES) return { ok: false, reason: 'frames' }

  const frames: PersistedFrame[] = []
  for (const candidate of data.frames) {
    const frame = parseFrame(candidate)
    if (!frame) return { ok: false, reason: 'frame' }
    frames.push(frame)
  }

  let wallRegion = data.wallRegion === null || data.wallRegion === undefined ? null : parseQuad(data.wallRegion)
  if (wallRegion && quadArea(wallRegion) < 1) wallRegion = null
  // "wall-surface" without a usable region is meaningless — fall back to free.
  const placementMode: PlacementMode = data.placementMode === 'wall-surface' && wallRegion ? 'wall-surface' : 'free'

  const furthest = isNum(data.furthestStep) ? Math.round(data.furthestStep) : 1
  const current = isNum(data.currentStep) ? Math.round(data.currentStep) : 1

  return {
    ok: true,
    draft: {
      version: DRAFT_VERSION,
      savedAt: isNum(data.savedAt) ? data.savedAt : 0,
      wall,
      wallWidthCm: sanitizeWallWidthCm(isNum(data.wallWidthCm) ? data.wallWidthCm : NaN),
      activeLayoutId: isString(data.activeLayoutId) ? data.activeLayoutId : '',
      activeProductId: isString(data.activeProductId) && hasProduct(data.activeProductId) ? data.activeProductId : DEFAULT_PRODUCT_ID,
      hasCustomProduct: data.hasCustomProduct === true,
      placementMode,
      wallRegion: placementMode === 'wall-surface' ? wallRegion : null,
      frames,
      currentStep: Math.min(6, Math.max(1, current)),
      furthestStep: Math.min(6, Math.max(1, furthest)),
    },
  }
}
