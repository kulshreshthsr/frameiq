import { canonicalJson, roundTo } from '../../shared/canonical'
import type { Catalog } from '../../shared/catalog'
import { DESIGN_SNAPSHOT_VERSION, designSnapshotSchema, type DesignSnapshot, type FrameSnapshot } from '../../shared/orderSchema'
import { computeOrderTotals } from '../../shared/pricing'
import { findSku } from '../domain/catalog'
import { resolveFrameStyle } from '../domain/frameStyle'
import { skuDimensionsIn, isSquareSku } from '../domain/sizing'
import { computeInnerOpening } from '../lib/frameGeometry'
import type { PlacementMode } from '../domain/placement'
import type { FrameInstance, PerspectiveCorners, WallImage } from '../types/frame'
import { computeCropRect } from './crop'

/**
 * THE DESIGN SNAPSHOT BUILDER.
 *
 * "Continue to order" freezes what the customer designed into a deliberate,
 * versioned document (shared/orderSchema.ts) — NOT a dump of store state. It
 * holds everything needed to reconstruct exactly what was ordered: the wall
 * and its calibration, the layout, every frame's product, size, options,
 * position and crop, and the price the customer was shown.
 *
 * DETERMINISTIC: the same design always produces the same snapshot (numbers
 * are rounded so floating-point noise can't make identical designs differ),
 * and therefore the same digest. The only field that varies is `createdAt`,
 * which the digest deliberately ignores.
 */

export interface SnapshotInput {
  wall: WallImage
  wallWidthCm: number
  placementMode: PlacementMode
  wallRegion: PerspectiveCorners | null
  layoutId: string
  frames: FrameInstance[]
  catalog: Catalog
  now: Date
  appVersion: string
}

const round3 = (n: number) => roundTo(n, 3)
const round5 = (n: number) => roundTo(n, 5)

function roundQuad(quad: PerspectiveCorners): PerspectiveCorners {
  const p = (pt: { x: number; y: number }) => ({ x: round3(pt.x), y: round3(pt.y) })
  return { topLeft: p(quad.topLeft), topRight: p(quad.topRight), bottomRight: p(quad.bottomRight), bottomLeft: p(quad.bottomLeft) }
}

function frameSnapshot(frame: FrameInstance, index: number): FrameSnapshot {
  const sku = findSku(frame.productId, frame.sizeId)
  if (!sku) throw new Error(`Frame ${index + 1} has a size that is not sold`)

  const sizeIn = skuDimensionsIn(sku, isSquareSku(sku) ? 'portrait' : frame.orientation)
  const style = resolveFrameStyle(frame.productId, frame.matId)
  const openingPx = computeInnerOpening(frame.width, frame.height, style)
  // Pixels → inches: the frame's outer width in pixels IS its outer width in inches.
  const inchesPerPx = sizeIn.width / frame.width

  return {
    id: frame.id,
    slotId: frame.slotId,
    number: index + 1,
    productId: frame.productId,
    sizeId: frame.sizeId,
    orientation: frame.orientation,
    glassId: frame.glassId,
    matId: frame.matId,
    anchor: { xPct: round5(frame.anchor.xPct), yPct: round5(frame.anchor.yPct) },
    tilt: round3(frame.tilt),
    sizeIn: { width: sizeIn.width, height: sizeIn.height },
    openingIn: { width: round3(openingPx.width * inchesPerPx), height: round3(openingPx.height * inchesPerPx) },
    geometry: {
      x: round3(frame.x),
      y: round3(frame.y),
      width: round3(frame.width),
      height: round3(frame.height),
      rotation: round3(frame.rotation),
      ...(frame.perspective ? { perspective: roundQuad(frame.perspective) } : {}),
    },
    photo: frame.photo
      ? {
          asset: {
            assetId: frame.photo.assetId,
            width: frame.photo.width,
            height: frame.photo.height,
            sourceWidth: frame.photo.sourceWidth,
            sourceHeight: frame.photo.sourceHeight,
          },
          transform: {
            offsetX: round3(frame.photoTransform.offsetX),
            offsetY: round3(frame.photoTransform.offsetY),
            scale: roundTo(frame.photoTransform.scale, 6),
            rotation: round3(frame.photoTransform.rotation),
          },
          crop: computeCropRect(openingPx, frame.photo, frame.photoTransform),
        }
      : null,
  }
}

export function buildDesignSnapshot(input: SnapshotInput): DesignSnapshot {
  const { catalog, frames } = input
  const totals = computeOrderTotals(catalog, frames)
  if (frames.length === 0) throw new Error('There are no frames to order')
  if (totals.unpricedFrameIds.length > 0) throw new Error('Some frames are not available as configured')

  return {
    schemaVersion: DESIGN_SNAPSHOT_VERSION,
    app: { name: 'framengine', version: input.appVersion, catalogVersion: catalog.version },
    createdAt: input.now.toISOString(),
    wall: {
      asset: {
        assetId: input.wall.assetId,
        width: input.wall.width,
        height: input.wall.height,
        sourceWidth: input.wall.sourceWidth,
        sourceHeight: input.wall.sourceHeight,
      },
      widthCm: input.wallWidthCm,
      placementMode: input.placementMode,
      region: input.wallRegion ? roundQuad(input.wallRegion) : null,
    },
    layoutId: input.layoutId,
    frames: frames.map(frameSnapshot),
    // Lines are already grouped by identical configuration, in first-seen order.
    items: totals.lines.map((line) => ({ productId: line.productId, sizeId: line.sizeId, glassId: line.glassId, matId: line.matId, quantity: line.quantity })),
    pricing: {
      currency: totals.currency,
      subtotalMinor: totals.subtotalMinor,
      deliveryFeeMinor: totals.deliveryFeeMinor,
      totalMinor: totals.totalMinor,
    },
  }
}

/** True if the snapshot is valid under the same schema the server enforces. */
export function isValidSnapshot(snapshot: unknown): boolean {
  return designSnapshotSchema.safeParse(snapshot).success
}

/** The design's fingerprint: SHA-256 of its canonical form, ignoring only the
 * creation time. Identical designs share a digest; any change alters it. */
export async function snapshotDigest(snapshot: DesignSnapshot): Promise<string> {
  return sha256Hex(canonicalJson({ ...snapshot, createdAt: undefined }))
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
