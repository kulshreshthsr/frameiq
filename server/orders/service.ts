import { createHash } from 'node:crypto'
import { canonicalJson } from '../../shared/canonical.ts'
import { findGlass, findMat, findProduct, findSize, type Catalog } from '../../shared/catalog.ts'
import { MAX_FRAMES } from '../../shared/limits.ts'
import { createOrderRequestSchema, idempotencyKeySchema, type FrameSnapshot, type OrderView, type ParsedCreateOrderRequest } from '../../shared/orderSchema.ts'
import { computeOrderTotals, type ConfiguredFrame } from '../../shared/pricing.ts'
import { cropIsInsideImage, findImageProblems, type ImageDims } from '../../shared/production.ts'
import { loadCatalog } from '../catalog/catalogRepo.ts'
import type { AppContext } from '../context.ts'
import { isUniqueViolation, queryOne, run, withTx } from '../db/client.ts'
import { AppError, errors } from '../errors.ts'
import { getUpload } from '../uploads/service.ts'
import { findOrderByIdempotencyKey, findOrderByPublicId, formatPublicId, hashToken, rowToOrder, toOrderView, tokenMatches, type OrderRow } from './repo.ts'

/**
 * ORDER CREATION AND ACCESS.
 *
 * The server never takes the browser's word for anything that matters:
 *   - the PRICE is recomputed from the database catalog (the browser's total
 *     is only compared against it, to notice a price change);
 *   - every CONFIGURATION is checked against the catalog (is this product
 *     sold, in this size, with this glass and mat?);
 *   - every PHOTO must exist as an uploaded original that is sharp enough
 *     to print at the size ordered.
 * Only then is the order written — in one transaction, exactly once per
 * idempotency key, with a permanent snapshot of what was bought and at what
 * price.
 */

export interface CreatedOrder {
  order: OrderView
  /** True if this request was a repeat of one already handled. */
  replayed: boolean
  digest: string
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function describeIssues(issues: { path: PropertyKey[]; message: string }[]): { field: string; message: string }[] {
  return issues.slice(0, 20).map((issue) => ({ field: issue.path.map(String).join('.'), message: issue.message }))
}

export async function createOrder(ctx: AppContext, body: unknown, idempotencyKeyHeader: string | undefined): Promise<CreatedOrder> {
  // 1 — the request must be well-formed.
  const keyCheck = idempotencyKeySchema.safeParse(idempotencyKeyHeader ?? '')
  if (!keyCheck.success) throw new AppError('MISSING_IDEMPOTENCY_KEY', 400, 'This request is missing its safety key. Please refresh and try again.')
  const idempotencyKey = keyCheck.data

  const parsed = createOrderRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError('INVALID_ORDER_REQUEST', 400, 'Some of the order details need another look.', { fields: describeIssues(parsed.error.issues) })
  }
  const request = parsed.data
  const requestHash = sha256(canonicalJson(request))

  // 2 — a repeat of a request we've already handled returns the same order.
  const existing = await findOrderByIdempotencyKey(ctx.db, idempotencyKey)
  if (existing) return replay(ctx, existing, requestHash)

  // 3 — check the design against the catalog and recompute the price.
  const catalog = await loadCatalog(ctx.db)
  const frames = request.snapshot.frames
  const configured: ConfiguredFrame[] = frames.map((f) => ({ id: f.id, productId: f.productId, sizeId: f.sizeId, glassId: f.glassId, matId: f.matId }))
  const totals = computeOrderTotals(catalog, configured)

  if (totals.unpricedFrameIds.length > 0) {
    const numbers = frames.filter((f) => totals.unpricedFrameIds.includes(f.id)).map((f) => f.number)
    throw errors.conflict('ITEM_UNAVAILABLE', `Frame${numbers.length === 1 ? '' : 's'} ${numbers.join(', ')} ${numbers.length === 1 ? 'is' : 'are'} no longer available as configured. Please choose another style or size.`, {
      frameNumbers: numbers,
      catalogVersion: catalog.version,
    })
  }
  if (request.snapshot.pricing.currency !== catalog.currency) throw errors.invalidOrder('That order is in the wrong currency.')

  checkFrames(catalog, frames)
  checkItemsMatchFrames(request)

  const claimed = request.snapshot.pricing
  if (claimed.subtotalMinor !== totals.subtotalMinor || claimed.deliveryFeeMinor !== totals.deliveryFeeMinor || claimed.totalMinor !== totals.totalMinor) {
    throw errors.conflict('PRICE_CHANGED', 'The price has changed since you started. Please review your order again.', {
      serverTotals: { currency: totals.currency, subtotalMinor: totals.subtotalMinor, deliveryFeeMinor: totals.deliveryFeeMinor, totalMinor: totals.totalMinor },
      catalogVersion: catalog.version,
    })
  }

  // 4 — every photo must exist as a printable original.
  const uploadIds = await resolveUploads(ctx, request)

  // 5 — write everything at once.
  const snapshotJson = canonicalJson(request.snapshot)
  const snapshotDigest = sha256(canonicalJson({ ...request.snapshot, createdAt: undefined }))
  const now = ctx.now()

  try {
    const created = await withTx(ctx.db, async (tx) => {
      const year = now.getUTCFullYear()
      const counter = await queryOne(tx, 'INSERT INTO order_counters (year, last) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET last = last + 1 RETURNING last', [year])
      const publicId = formatPublicId(year, Number(counter!.last))

      const result = await run(
        tx,
        `INSERT INTO orders (public_id, access_token_hash, idempotency_key, request_hash, customer_name, customer_mobile, delivery_json,
           currency, subtotal_minor, delivery_fee_minor, total_minor, payment_status, order_status, catalog_version,
           snapshot_json, snapshot_digest, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending_payment', ?, ?, ?, ?, ?)`,
        [
          publicId,
          hashToken(request.accessToken),
          idempotencyKey,
          requestHash,
          request.customer.name,
          request.customer.mobile,
          JSON.stringify(request.delivery),
          totals.currency,
          totals.subtotalMinor,
          totals.deliveryFeeMinor,
          totals.totalMinor,
          catalog.version,
          snapshotJson,
          snapshotDigest,
          now.toISOString(),
          now.toISOString(),
        ],
      )
      const orderId = Number(result.lastInsertRowid)

      for (const [position, line] of totals.lines.entries()) {
        const product = findProduct(catalog, line.productId)!
        const size = findSize(catalog, line.productId, line.sizeId)!
        const numbers = frames.filter((f) => line.frameIds.includes(f.id)).map((f) => f.number)
        await run(
          tx,
          `INSERT INTO order_items (order_id, position, product_id, product_name, style_id, size_id, size_label, width, height, unit,
             glass_id, glass_name, mat_id, mat_name, quantity, unit_price_minor, line_total_minor, frame_numbers)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            position,
            product.id,
            product.name,
            product.styleId,
            size.id,
            size.displayLabel,
            size.width,
            size.height,
            size.unit,
            line.glassId,
            findGlass(catalog, line.glassId)!.name,
            line.matId,
            findMat(catalog, line.matId)!.name,
            line.quantity,
            line.unitPriceMinor,
            line.lineTotalMinor,
            numbers.join(','),
          ],
        )
      }

      const link = (role: 'wall' | 'preview' | 'photo', assetId: string, uploadId: string) =>
        run(tx, 'INSERT OR IGNORE INTO order_uploads (order_id, role, asset_id, upload_id) VALUES (?, ?, ?, ?)', [orderId, role, assetId, uploadId])
      await link('wall', request.snapshot.wall.asset.assetId, uploadIds.wall)
      await link('preview', 'preview', uploadIds.preview)
      for (const [assetId, uploadId] of Object.entries(uploadIds.photos)) await link('photo', assetId, uploadId)

      const row = await queryOne(tx, 'SELECT * FROM orders WHERE id = ?', [orderId])
      return rowToOrder(row as unknown as Record<string, unknown>)
    })

    ctx.log.event('order.created', {
      publicOrderId: created.publicId,
      frames: frames.length,
      totalMinor: created.totalMinor,
      catalogVersion: catalog.version,
      idem: idempotencyKey.slice(0, 8),
    })
    return { order: await toOrderView(ctx.db, created), replayed: false, digest: snapshotDigest }
  } catch (error) {
    // Two identical requests at the same instant (a double-click): the loser
    // hits the UNIQUE key and simply gets the winner's order.
    if (isUniqueViolation(error, 'idempotency_key')) {
      const winner = await findOrderByIdempotencyKey(ctx.db, idempotencyKey)
      if (winner) return replay(ctx, winner, requestHash)
    }
    throw error
  }
}

async function replay(ctx: AppContext, existing: OrderRow, requestHash: string): Promise<CreatedOrder> {
  if (existing.requestHash !== requestHash) {
    throw errors.conflict('IDEMPOTENCY_KEY_REUSED', 'That request key was already used for a different order. Please refresh and start again.')
  }
  ctx.log.event('order.replayed', { publicOrderId: existing.publicId })
  return { order: await toOrderView(ctx.db, existing), replayed: true, digest: existing.snapshotDigest }
}

// ---------------------------------------------------------------- checks

/** Frame-level sanity: the sizes in the snapshot are the catalog's sizes, and
 * the visible opening and crop are physically possible. */
function checkFrames(catalog: Catalog, frames: FrameSnapshot[]) {
  if (frames.length > MAX_FRAMES) throw errors.invalidOrder('That design has too many frames.')
  for (const frame of frames) {
    const size = findSize(catalog, frame.productId, frame.sizeId)!
    const expected = frame.orientation === 'landscape' ? { width: size.height, height: size.width } : { width: size.width, height: size.height }
    if (Math.abs(frame.sizeIn.width - expected.width) > 0.01 || Math.abs(frame.sizeIn.height - expected.height) > 0.01) {
      throw errors.invalidOrder(`Frame ${frame.number} doesn’t match its size.`, { frameNumber: frame.number })
    }
    const { openingIn } = frame
    if (openingIn.width > frame.sizeIn.width + 0.01 || openingIn.height > frame.sizeIn.height + 0.01 || openingIn.width < frame.sizeIn.width * 0.4 || openingIn.height < frame.sizeIn.height * 0.4) {
      throw errors.invalidOrder(`Frame ${frame.number} has an impossible opening.`, { frameNumber: frame.number })
    }
    if (frame.photo && !cropIsInsideImage(frame.photo.crop)) {
      throw errors.invalidOrder(`The photo in frame ${frame.number} doesn’t fully cover the frame.`, { frameNumber: frame.number })
    }
  }
}

/** The snapshot's item list is a summary of its frames; they must agree. */
function checkItemsMatchFrames(request: ParsedCreateOrderRequest) {
  const key = (i: { productId: string; sizeId: string; glassId: string; matId: string }) => [i.productId, i.sizeId, i.glassId, i.matId].join('|')
  const fromFrames = new Map<string, number>()
  for (const f of request.snapshot.frames) fromFrames.set(key(f), (fromFrames.get(key(f)) ?? 0) + 1)
  const fromItems = new Map<string, number>()
  for (const i of request.snapshot.items) fromItems.set(key(i), (fromItems.get(key(i)) ?? 0) + i.quantity)
  const same = fromFrames.size === fromItems.size && [...fromFrames].every(([k, q]) => fromItems.get(k) === q)
  if (!same) throw errors.invalidOrder('The item list doesn’t match the frames in the design.')
}

async function resolveUploads(ctx: AppContext, request: ParsedCreateOrderRequest) {
  const wall = await getUpload(ctx, request.uploads.wall)
  if (!wall) throw new AppError('MISSING_UPLOAD', 422, 'Your wall photo didn’t finish uploading. Please try again.', { role: 'wall' })
  const preview = await getUpload(ctx, request.uploads.preview)
  if (!preview) throw new AppError('MISSING_UPLOAD', 422, 'Your design preview didn’t finish uploading. Please try again.', { role: 'preview' })
  if (preview.mime !== 'image/png') throw errors.invalidOrder('The design preview must be a PNG image.')

  const dims: Record<string, ImageDims | undefined> = {}
  const photos: Record<string, string> = {}
  for (const frame of request.snapshot.frames) {
    if (!frame.photo) continue
    const assetId = frame.photo.asset.assetId
    const uploadId = request.uploads.photos[assetId]
    const upload = uploadId ? await getUpload(ctx, uploadId) : null
    if (upload) {
      dims[assetId] = { width: upload.width, height: upload.height }
      photos[assetId] = upload.uploadId
    }
  }

  const problems = findImageProblems(request.snapshot, dims)
  if (problems.length > 0) {
    throw new AppError('IMAGE_PROBLEMS', 422, imageProblemMessage(problems), { problems })
  }
  return { wall: wall.uploadId, preview: preview.uploadId, photos }
}

function imageProblemMessage(problems: ReturnType<typeof findImageProblems>): string {
  const first = problems[0]
  const others = problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''
  switch (first.code) {
    case 'missing':
      return `We don’t have the original photo for frame ${first.frameNumber}${others}. Please add it again.`
    case 'wrong_shape':
      return `The photo uploaded for frame ${first.frameNumber} doesn’t match the one you designed with${others}.`
    case 'low_resolution':
      return `The photo in frame ${first.frameNumber} is too small to print sharply at this size${others}. Choose a smaller size or a higher-resolution photo.`
  }
}

// ---------------------------------------------------------------- access

/** Loads an order the caller can prove they own. Wrong id and wrong token look
 * identical (404), so order ids can't be probed. */
export async function authorizeOrder(ctx: Pick<AppContext, 'db'>, publicId: string, token: string | undefined): Promise<OrderRow> {
  const order = await findOrderByPublicId(ctx.db, publicId)
  if (!order || !token || !tokenMatches(token, order.accessTokenHash)) throw errors.notFound('That order')
  return order
}

export async function getOrderView(ctx: AppContext, publicId: string, token: string | undefined): Promise<OrderView> {
  return toOrderView(ctx.db, await authorizeOrder(ctx, publicId, token))
}

/** Cancels an order that hasn't been paid. Repeating it is harmless. */
export async function cancelOrder(ctx: AppContext, publicId: string, token: string | undefined): Promise<OrderView> {
  const order = await authorizeOrder(ctx, publicId, token)
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
    throw errors.conflict('ALREADY_PAID', 'This order has been paid, so it can’t be cancelled here. Please contact us.')
  }
  if (order.orderStatus !== 'cancelled') {
    const now = ctx.now().toISOString()
    await withTx(ctx.db, async (tx) => {
      await run(tx, `UPDATE orders SET order_status = 'cancelled', payment_status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`, [now, now, order.id])
      await run(tx, `UPDATE payments SET status = 'cancelled', updated_at = ? WHERE order_id = ? AND status = 'created'`, [now, order.id])
    })
    ctx.log.event('order.cancelled', { publicOrderId: order.publicId })
  }
  return toOrderView(ctx.db, (await findOrderByPublicId(ctx.db, publicId))!)
}
