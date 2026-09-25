import { createHash } from 'node:crypto'
import { formatMoney } from '../../shared/money.ts'
import { printPpi } from '../../shared/production.ts'
import type { DesignSnapshot, FrameSnapshot } from '../../shared/orderSchema.ts'
import type { AppContext } from '../context.ts'
import { query, run } from '../db/client.ts'
import { findOrderById, loadItems, loadLastPayment, type OrderRow } from '../orders/repo.ts'
import { EXTENSION_FOR, type ImageMime } from '../images/inspect.ts'

/**
 * THE PRODUCTION PACKAGE.
 *
 * Everything a person needs to make an order, in one folder:
 *
 *   FRM-2026-000123/
 *     SHEET.txt         plain-language production sheet — read this first
 *     order.json        structured order: customer, delivery, items, prices, payment
 *     design.json       the full design snapshot (positions, crops, calibration)
 *     preview.png       the final export — what the customer approved
 *     wall.<ext>        the customer's wall photo (reference)
 *     photos/frame-NN.<ext>   each frame's ORIGINAL photo, full resolution
 *     MANIFEST.json     every file with its size and SHA-256
 *
 * Generated when an order is paid, and safe to regenerate at any time
 * (`npm run order:package -- FRM-…`): the same order always yields the same package.
 */

export interface PackageFile {
  path: string
  bytes: number
  sha256: string
}

export interface PackageResult {
  folder: string
  files: PackageFile[]
}

export async function generateProductionPackage(ctx: AppContext, orderId: number): Promise<PackageResult> {
  const order = await findOrderById(ctx.db, orderId)
  if (!order) throw new Error(`Order ${orderId} not found`)
  const snapshot = JSON.parse(order.snapshotJson) as DesignSnapshot
  const folder = order.publicId

  const linkRows = await query(
    ctx.db,
    `SELECT ou.role, ou.asset_id, u.storage_key, u.mime
       FROM order_uploads ou JOIN uploads u ON u.id = ou.upload_id
      WHERE ou.order_id = ?`,
    [order.id],
  )
  const links = linkRows.map((r) => ({ role: String(r.role), assetId: String(r.asset_id), storageKey: String(r.storage_key), mime: String(r.mime) as ImageMime }))

  const files: PackageFile[] = []
  const write = async (relativePath: string, data: Buffer, contentType: string) => {
    await ctx.packageStorage.put(`${folder}/${relativePath}`, data, contentType)
    files.push({ path: relativePath, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
  }
  const copyFromUploads = async (storageKey: string, relativePath: string, mime: string) => {
    const data = await ctx.storage.get(storageKey)
    if (!data) throw new Error(`Missing stored image ${storageKey} for ${order.publicId}`)
    await write(relativePath, data, mime)
  }

  // Images
  const wall = links.find((l) => l.role === 'wall')
  if (wall) await copyFromUploads(wall.storageKey, `wall.${EXTENSION_FOR[wall.mime]}`, wall.mime)
  const preview = links.find((l) => l.role === 'preview')
  if (preview) await copyFromUploads(preview.storageKey, 'preview.png', 'image/png')

  const photoFileForFrame = new Map<number, string>()
  for (const frame of snapshot.frames) {
    if (!frame.photo) continue
    const link = links.find((l) => l.role === 'photo' && l.assetId === frame.photo!.asset.assetId)
    if (!link) throw new Error(`Frame ${frame.number} has no stored original photo`)
    const name = `photos/frame-${String(frame.number).padStart(2, '0')}.${EXTENSION_FOR[link.mime]}`
    await copyFromUploads(link.storageKey, name, link.mime)
    photoFileForFrame.set(frame.number, name)
  }

  // Structured data
  const items = await loadItems(ctx.db, order.id)
  const lastPayment = await loadLastPayment(ctx.db, order.id)
  const orderJson = {
    publicOrderId: order.publicId,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    packagedAt: ctx.now().toISOString(),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    customer: { name: order.customerName, mobile: order.customerMobile },
    delivery: order.delivery,
    currency: order.currency,
    items,
    subtotalMinor: order.subtotalMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
    catalogVersion: order.catalogVersion,
    designDigest: order.snapshotDigest,
    lastPayment,
  }
  await write('order.json', Buffer.from(JSON.stringify(orderJson, null, 2)), 'application/json')
  await write('design.json', Buffer.from(JSON.stringify(snapshot, null, 2)), 'application/json')
  await write('SHEET.txt', Buffer.from(buildProductionSheet(order, snapshot, photoFileForFrame, productNamesFromItems(items)), 'utf8'), 'text/plain')

  // The manifest lists everything above (and, naturally, not itself).
  await ctx.packageStorage.put(`${folder}/MANIFEST.json`, Buffer.from(JSON.stringify({ order: order.publicId, files }, null, 2)), 'application/json')

  await run(ctx.db, 'UPDATE orders SET package_path = ?, package_generated_at = ? WHERE id = ?', [folder, ctx.now().toISOString(), order.id])
  ctx.log.event('production_package.generated', { publicOrderId: order.publicId, files: files.length + 1 })
  return { folder, files }
}

// ---------------------------------------------------------------- the sheet

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function frameBlock(frame: FrameSnapshot, photoFile: string | undefined, productName: string): string[] {
  const lines = [
    `FRAME ${frame.number}`,
    `  Product      : ${productName}`,
    `  Size         : ${frame.sizeIn.width} × ${frame.sizeIn.height} in (${frame.orientation})`,
    `  Visible opening: ${frame.openingIn.width.toFixed(2)} × ${frame.openingIn.height.toFixed(2)} in`,
    `  Glass / mat  : ${frame.glassId} / ${frame.matId}`,
  ]
  if (!frame.photo) {
    lines.push('  Photo        : NONE — frame ordered empty')
  } else {
    const { crop, asset } = frame.photo
    lines.push(
      `  Photo file   : ${photoFile ?? '(missing)'}  (${asset.sourceWidth} × ${asset.sourceHeight} px original)`,
      `  Crop         : x ${pct(crop.x)}, y ${pct(crop.y)}, ${pct(crop.width)} wide × ${pct(crop.height)} tall of the original`,
      `  Rotate first : ${crop.rotationDeg}°`,
      `  Prints at    : ${Math.round(printPpi(crop, frame.openingIn, { width: asset.sourceWidth, height: asset.sourceHeight }))} pixels per inch`,
    )
  }
  return lines
}

/** Plain-language instructions for whoever makes the order. Pure, so it is tested directly. */
export function buildProductionSheet(order: OrderRow, snapshot: DesignSnapshot, photoFiles: Map<number, string>, productNames: Record<string, string> = {}): string {
  const money = (minor: number) => formatMoney(minor, order.currency)
  const out: string[] = []
  out.push(`PRODUCTION SHEET — ${order.publicId}`, '='.repeat(60), '')
  out.push(`Ordered     : ${order.createdAt}`, `Payment     : ${order.paymentStatus}${order.paidAt ? ` (${order.paidAt})` : ''}`, `Frames      : ${snapshot.frames.length}`, `Order total : ${money(order.totalMinor)} (frames ${money(order.subtotalMinor)} + delivery ${money(order.deliveryFeeMinor)})`, '')
  out.push('DELIVER TO', '-'.repeat(60), order.customerName, `Mobile: ${order.customerMobile}`, order.delivery.line1)
  if (order.delivery.line2) out.push(order.delivery.line2)
  out.push(`${order.delivery.city}, ${order.delivery.state} ${order.delivery.pin}`, '')
  out.push('FRAMES TO MAKE', '-'.repeat(60))
  for (const frame of snapshot.frames) {
    out.push(...frameBlock(frame, photoFiles.get(frame.number), productNames[frame.productId] ?? frame.productId), '')
  }
  out.push('FILES', '-'.repeat(60), 'preview.png  the final design the customer approved (for reference)', 'wall.*       the customer’s wall photo (reference only — do not print)', 'photos/      the ORIGINAL photo for each frame — print from these', 'design.json  exact positions and crops', '')
  out.push('If anything is unclear or a photo looks wrong, contact the customer before producing.')
  return out.join('\n')
}

// The sheet builder takes product names from the order's own item rows (a
// permanent snapshot), not from today's catalog.
export function productNamesFromItems(items: { productId: string; productName: string }[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.productId, i.productName]))
}
