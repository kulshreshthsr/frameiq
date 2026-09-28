import type { AdminUser, ProductCreateInput, ProductUpdateInput, SizeCreateInput, SizeUpdateInput } from '../../shared/admin.ts'
import type { AdminCatalog, AdminProductView, AdminSizeView, CatalogAuditEntry } from '../../shared/admin.ts'
import { validateCatalog } from '../../shared/catalog.ts'
import { errors } from '../errors.ts'
import { query, queryOne, run, withTx, type Db, type Executor, type Transaction } from '../db/client.ts'
import { loadCatalog } from './catalogRepo.ts'

/**
 * THE ADMIN'S VIEW OF THE CATALOG, AND ITS ONLY WRITE PATH.
 *
 * Unlike `saveCatalog` (a wholesale replace, for development bootstrapping),
 * every function here changes ONE product or size, inside a transaction,
 * and:
 *   - re-validates the WHOLE resulting catalog with the same
 *     `validateCatalog` the seed data must pass — so an edit can never leave
 *     the shop in a state a customer could reach and be quoted nonsense;
 *   - checks the row's `rowVersion` first (optimistic concurrency): a save
 *     built on a value someone else has since changed is refused, not
 *     silently overwritten;
 *   - writes an audit row for every field that actually changed.
 *
 * Nothing here touches `orders` or their price snapshots — those are already
 * immutable by construction (`orders/service.ts` copies the price at the
 * moment of purchase into `order_items`, never a reference back here).
 */

export interface StaleVersionInfo {
  productId: string
  sizeId: string | null
  expectedVersion: number
  currentVersion: number
}

export class StaleVersionError extends Error {
  readonly info: StaleVersionInfo
  constructor(info: StaleVersionInfo) {
    super('This was changed by someone else since you loaded it.')
    this.info = info
  }
}

const money = (n: number) => Math.round(n)

async function requireProduct(ex: Executor, productId: string): Promise<Record<string, unknown>> {
  const row = await queryOne(ex, 'SELECT * FROM catalog_products WHERE id = ?', [productId])
  if (!row) throw errors.notFound('That product')
  return row
}

async function requireSize(ex: Executor, productId: string, sizeId: string): Promise<Record<string, unknown>> {
  const row = await queryOne(ex, 'SELECT * FROM catalog_sizes WHERE product_id = ? AND id = ?', [productId, sizeId])
  if (!row) throw errors.notFound('That size')
  return row
}

async function assertOptionsExist(ex: Executor, kind: 'glass' | 'mat', ids: string[]): Promise<void> {
  for (const id of ids) {
    const table = kind === 'glass' ? 'catalog_glass_options' : 'catalog_mat_options'
    const row = await queryOne(ex, `SELECT 1 AS one FROM ${table} WHERE id = ?`, [id])
    if (!row) throw errors.badRequest(`There’s no ${kind} option "${id}".`)
  }
}

/** Re-validates the whole catalog (as it would be after the caller's SQL
 * writes go through) and throws a 422 naming every problem if it wouldn't be
 * consistent. Called inside the same transaction as the write, before it
 * commits — a bad edit never becomes visible even for an instant. */
async function assertStillValid(tx: Transaction): Promise<void> {
  const catalog = await loadCatalog(tx)
  const problems = validateCatalog(catalog)
  if (problems.length > 0) throw errors.badRequest('That change would leave the catalog inconsistent.', { problems })
}

function nextSort(rows: Record<string, unknown>[]): number {
  return rows.reduce((max, r) => Math.max(max, Number(r.sort)), -1) + 1
}

// ---------------------------------------------------------------- audit

interface AuditWrite {
  batchId: string
  actor: AdminUser
  action: string
  productId: string
  productSizeId?: string | null
  field: string
  oldValue?: string | number | boolean | null
  newValue?: string | number | boolean | null
  oldPriceMinor?: number | null
  newPriceMinor?: number | null
  note?: string | null
}

const asText = (v: string | number | boolean | null | undefined): string | null => (v === undefined || v === null ? null : String(v))

async function writeAudit(tx: Transaction, now: Date, w: AuditWrite): Promise<void> {
  await run(
    tx,
    `INSERT INTO catalog_audit_log (batch_id, actor_user_id, actor_name, action, product_id, product_size_id, field, old_value, new_value, old_price_minor, new_price_minor, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [w.batchId, w.actor.id, w.actor.name, w.action, w.productId, w.productSizeId ?? null, w.field, asText(w.oldValue), asText(w.newValue), w.oldPriceMinor ?? null, w.newPriceMinor ?? null, w.note ?? null, now.toISOString()],
  )
}

function rowToAudit(r: Record<string, unknown>): CatalogAuditEntry {
  return {
    id: Number(r.id),
    batchId: String(r.batch_id),
    actorUserId: String(r.actor_user_id),
    actorName: String(r.actor_name),
    action: String(r.action),
    productId: String(r.product_id),
    productSizeId: r.product_size_id ? String(r.product_size_id) : null,
    field: String(r.field),
    oldValue: r.old_value === null ? null : String(r.old_value),
    newValue: r.new_value === null ? null : String(r.new_value),
    oldPriceMinor: r.old_price_minor === null ? null : Number(r.old_price_minor),
    newPriceMinor: r.new_price_minor === null ? null : Number(r.new_price_minor),
    note: r.note === null ? null : String(r.note),
    createdAt: String(r.created_at),
  }
}

export interface AuditFilter {
  productId?: string
  sizeId?: string
  limit?: number
}

export async function listAudit(ex: Executor, filter: AuditFilter = {}): Promise<CatalogAuditEntry[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
  const clauses: string[] = []
  const args: (string | number)[] = []
  if (filter.productId) {
    clauses.push('product_id = ?')
    args.push(filter.productId)
  }
  if (filter.sizeId) {
    clauses.push('product_size_id = ?')
    args.push(filter.sizeId)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await query(ex, `SELECT * FROM catalog_audit_log ${where} ORDER BY id DESC LIMIT ?`, [...args, limit])
  return rows.map((r) => rowToAudit(r as unknown as Record<string, unknown>))
}

export async function findAuditEntry(ex: Executor, id: number): Promise<CatalogAuditEntry | null> {
  const row = await queryOne(ex, 'SELECT * FROM catalog_audit_log WHERE id = ?', [id])
  return row ? rowToAudit(row as unknown as Record<string, unknown>) : null
}

// ---------------------------------------------------------------- reading

export async function loadAdminCatalog(ex: Executor): Promise<AdminCatalog> {
  const catalog = await loadCatalog(ex)
  const productMeta = new Map((await query(ex, 'SELECT id, version, updated_at FROM catalog_products')).map((r) => [String(r.id), { version: Number(r.version), updatedAt: String(r.updated_at) }]))
  const sizeMeta = new Map(
    (await query(ex, 'SELECT product_id, id, version, updated_at FROM catalog_sizes')).map((r) => [`${String(r.product_id)}|${String(r.id)}`, { version: Number(r.version), updatedAt: String(r.updated_at) }]),
  )
  const products: AdminProductView[] = catalog.products.map((p) => {
    const meta = productMeta.get(p.id)!
    const sizes: AdminSizeView[] = p.sizes.map((s) => {
      const sm = sizeMeta.get(`${p.id}|${s.id}`)!
      return { ...s, rowVersion: sm.version, updatedAt: sm.updatedAt }
    })
    return { ...p, sizes, rowVersion: meta.version, updatedAt: meta.updatedAt }
  })
  return { ...catalog, products }
}

// ---------------------------------------------------------------- products

export async function createProduct(db: Db, input: ProductCreateInput, actor: AdminUser, now: Date): Promise<AdminCatalog> {
  await withTx(db, async (tx) => {
    if (await queryOne(tx, 'SELECT 1 AS one FROM catalog_products WHERE id = ?', [input.id])) {
      throw errors.conflict('DUPLICATE_ID', `A product with id "${input.id}" already exists.`)
    }
    await assertOptionsExist(tx, 'glass', input.glassOptionIds)
    await assertOptionsExist(tx, 'mat', input.matOptionIds)
    const sort = nextSort((await query(tx, 'SELECT sort FROM catalog_products')) as unknown as Record<string, unknown>[])
    // A brand-new product has no sizes yet, so it is always created inactive
    // — "active with nothing to sell" is exactly the state `validateCatalog`
    // exists to prevent. The owner adds a size, then switches it on.
    await run(
      tx,
      `INSERT INTO catalog_products (id, name, tagline, description, style_id, active, ships_with_mat, moulding_note, production_notes, sort, version, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?)`,
      [input.id, input.name, input.tagline, input.description, input.styleId, input.shipsWithMat ? 1 : 0, input.mouldingNote ?? null, input.productionNotes ?? null, sort, now.toISOString()],
    )
    for (const [i, id] of input.glassOptionIds.entries()) await run(tx, 'INSERT INTO catalog_product_options (product_id, kind, option_id, sort) VALUES (?, ?, ?, ?)', [input.id, 'glass', id, i])
    for (const [i, id] of input.matOptionIds.entries()) await run(tx, 'INSERT INTO catalog_product_options (product_id, kind, option_id, sort) VALUES (?, ?, ?, ?)', [input.id, 'mat', id, i])
    await writeAudit(tx, now, { batchId: `create_${input.id}`, actor, action: 'product.create', productId: input.id, field: 'product', newValue: input.name })
  })
  return loadAdminCatalog(db)
}

const PRODUCT_FIELD_COLUMNS: Record<string, string> = {
  name: 'name',
  tagline: 'tagline',
  description: 'description',
  styleId: 'style_id',
  shipsWithMat: 'ships_with_mat',
  active: 'active',
  mouldingNote: 'moulding_note',
  productionNotes: 'production_notes',
}

export async function updateProduct(db: Db, productId: string, patch: ProductUpdateInput, actor: AdminUser, now: Date): Promise<AdminCatalog> {
  await withTx(db, async (tx) => {
    const row = await requireProduct(tx, productId)
    const currentVersion = Number(row.version)
    if (currentVersion !== patch.expectedVersion) {
      throw new StaleVersionError({ productId, sizeId: null, expectedVersion: patch.expectedVersion, currentVersion })
    }
    if (patch.glassOptionIds) await assertOptionsExist(tx, 'glass', patch.glassOptionIds)
    if (patch.matOptionIds) await assertOptionsExist(tx, 'mat', patch.matOptionIds)

    const batchId = actor.id + '_' + String(now.getTime())
    const sets: string[] = []
    const args: (string | number | null)[] = []
    let changed = false
    const simple: (keyof Omit<ProductUpdateInput, 'glassOptionIds' | 'matOptionIds' | 'expectedVersion'>)[] = ['name', 'tagline', 'description', 'styleId', 'shipsWithMat', 'active', 'mouldingNote', 'productionNotes']
    for (const field of simple) {
      if (!(field in patch)) continue
      const incoming = patch[field]
      const before = field === 'shipsWithMat' || field === 'active' ? Number(row[PRODUCT_FIELD_COLUMNS[field]]) === 1 : ((row[PRODUCT_FIELD_COLUMNS[field]] as string | null) ?? null)
      const after = incoming ?? null
      if (String(before ?? '') === String(after ?? '')) continue
      sets.push(`${PRODUCT_FIELD_COLUMNS[field]} = ?`)
      args.push(typeof incoming === 'boolean' ? (incoming ? 1 : 0) : ((incoming as string | null) ?? null))
      await writeAudit(tx, now, { batchId, actor, action: 'product.update', productId, field, oldValue: before as string | number | boolean | null, newValue: incoming ?? null })
      changed = true
    }
    if (patch.glassOptionIds) {
      await run(tx, `DELETE FROM catalog_product_options WHERE product_id = ? AND kind = 'glass'`, [productId])
      for (const [i, id] of patch.glassOptionIds.entries()) await run(tx, 'INSERT INTO catalog_product_options (product_id, kind, option_id, sort) VALUES (?, ?, ?, ?)', [productId, 'glass', id, i])
      await writeAudit(tx, now, { batchId, actor, action: 'product.update', productId, field: 'glassOptionIds', newValue: patch.glassOptionIds.join(',') })
      changed = true
    }
    if (patch.matOptionIds) {
      await run(tx, `DELETE FROM catalog_product_options WHERE product_id = ? AND kind = 'mat'`, [productId])
      for (const [i, id] of patch.matOptionIds.entries()) await run(tx, 'INSERT INTO catalog_product_options (product_id, kind, option_id, sort) VALUES (?, ?, ?, ?)', [productId, 'mat', id, i])
      await writeAudit(tx, now, { batchId, actor, action: 'product.update', productId, field: 'matOptionIds', newValue: patch.matOptionIds.join(',') })
      changed = true
    }

    if (!changed) return // nothing actually changed
    const setClause = sets.length > 0 ? `${sets.join(', ')}, ` : ''
    await run(tx, `UPDATE catalog_products SET ${setClause}version = version + 1, updated_at = ? WHERE id = ?`, [...args, now.toISOString(), productId])
    await assertStillValid(tx)
  })
  return loadAdminCatalog(db)
}

// ---------------------------------------------------------------- sizes

export async function createSize(db: Db, productId: string, input: SizeCreateInput, actor: AdminUser, now: Date): Promise<AdminCatalog> {
  await withTx(db, async (tx) => {
    await requireProduct(tx, productId)
    if (await queryOne(tx, 'SELECT 1 AS one FROM catalog_sizes WHERE product_id = ? AND id = ?', [productId, input.id])) {
      throw errors.conflict('DUPLICATE_ID', `"${productId}" already has a size "${input.id}".`)
    }
    if (input.width > input.height) throw errors.badRequest('Sizes are stored portrait — width must not exceed height.')
    const sort = nextSort((await query(tx, 'SELECT sort FROM catalog_sizes WHERE product_id = ?', [productId])) as unknown as Record<string, unknown>[])
    await run(
      tx,
      `INSERT INTO catalog_sizes (product_id, id, width, height, unit, display_label, price_minor, glass_surcharge_minor, mat_surcharge_minor, active, sort, version, updated_at)
       VALUES (?, ?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, 1, ?)`,
      [productId, input.id, input.width, input.height, input.displayLabel, money(input.priceMinor), money(input.glassSurchargeMinor ?? 0), money(input.matSurchargeMinor ?? 0), (input.active ?? true) ? 1 : 0, sort, now.toISOString()],
    )
    await assertStillValid(tx)
    await writeAudit(tx, now, { batchId: `create_${productId}_${input.id}`, actor, action: 'size.create', productId, productSizeId: input.id, field: 'size', newValue: input.displayLabel, newPriceMinor: money(input.priceMinor) })
  })
  return loadAdminCatalog(db)
}

type SizeFieldKind = 'text' | 'money' | 'bool'
const SIZE_FIELDS: Record<string, { column: string; kind: SizeFieldKind }> = {
  displayLabel: { column: 'display_label', kind: 'text' },
  priceMinor: { column: 'price_minor', kind: 'money' },
  glassSurchargeMinor: { column: 'glass_surcharge_minor', kind: 'money' },
  matSurchargeMinor: { column: 'mat_surcharge_minor', kind: 'money' },
  active: { column: 'active', kind: 'bool' },
}

function currentSizeValue(row: Record<string, unknown>, kind: SizeFieldKind, column: string): string | number | boolean {
  if (kind === 'bool') return Number(row[column]) === 1
  if (kind === 'money') return Number(row[column])
  return String(row[column])
}

export async function updateSize(db: Db, productId: string, sizeId: string, patch: SizeUpdateInput, actor: AdminUser, now: Date): Promise<AdminCatalog> {
  await withTx(db, async (tx) => {
    const row = await requireSize(tx, productId, sizeId)
    const currentVersion = Number(row.version)
    if (currentVersion !== patch.expectedVersion) {
      throw new StaleVersionError({ productId, sizeId, expectedVersion: patch.expectedVersion, currentVersion })
    }
    const batchId = actor.id + '_' + String(now.getTime())
    const sets: string[] = []
    const args: (string | number)[] = []
    const fields: (keyof SizeUpdateInput)[] = ['displayLabel', 'priceMinor', 'glassSurchargeMinor', 'matSurchargeMinor', 'active']
    for (const field of fields) {
      if (!(field in patch)) continue
      const { column, kind } = SIZE_FIELDS[field]
      const before = currentSizeValue(row, kind, column)
      const incoming = patch[field] as string | number | boolean
      const after: string | number | boolean = kind === 'money' ? money(incoming as number) : incoming
      if (before === after) continue
      sets.push(`${column} = ?`)
      args.push(kind === 'bool' ? ((after as boolean) ? 1 : 0) : (after as string | number))
      await writeAudit(tx, now, {
        batchId,
        actor,
        action: 'size.update',
        productId,
        productSizeId: sizeId,
        field,
        oldValue: before,
        newValue: after,
        ...(field === 'priceMinor' ? { oldPriceMinor: before as number, newPriceMinor: after as number } : {}),
      })
    }
    if (sets.length === 0) return
    await run(tx, `UPDATE catalog_sizes SET ${sets.join(', ')}, version = version + 1, updated_at = ? WHERE product_id = ? AND id = ?`, [...args, now.toISOString(), productId, sizeId])
    await assertStillValid(tx)
  })
  return loadAdminCatalog(db)
}

// ---------------------------------------------------------------- bulk pricing

export interface BulkPriceUpdate {
  productId: string
  sizeId: string
  newPriceMinor: number
  expectedVersion: number
}

/**
 * Applies several size prices at once, ALL-OR-NOTHING: if any one of them is
 * stale (someone else changed it since the owner loaded the page) or invalid,
 * NONE are applied — the owner reloads and tries again, rather than half a
 * bulk edit silently going through.
 */
export async function bulkUpdatePrices(db: Db, updates: BulkPriceUpdate[], actor: AdminUser, now: Date, note?: string): Promise<AdminCatalog> {
  await withTx(db, async (tx) => {
    const batchId = `bulk_${actor.id}_${now.getTime()}`
    const stale: StaleVersionInfo[] = []
    const rows: { update: BulkPriceUpdate; oldPriceMinor: number }[] = []

    for (const update of updates) {
      const row = await queryOne(tx, 'SELECT price_minor, version FROM catalog_sizes WHERE product_id = ? AND id = ?', [update.productId, update.sizeId])
      if (!row) throw errors.notFound(`"${update.productId}" size "${update.sizeId}"`)
      const currentVersion = Number(row.version)
      if (currentVersion !== update.expectedVersion) {
        stale.push({ productId: update.productId, sizeId: update.sizeId, expectedVersion: update.expectedVersion, currentVersion })
        continue
      }
      rows.push({ update, oldPriceMinor: Number(row.price_minor) })
    }
    if (stale.length > 0) throw errors.conflict('STALE_VERSION', 'Some of these prices changed since you loaded this page. Nothing was applied — please reload and try again.', { stale })

    for (const { update, oldPriceMinor } of rows) {
      if (oldPriceMinor === update.newPriceMinor) continue
      await run(tx, 'UPDATE catalog_sizes SET price_minor = ?, version = version + 1, updated_at = ? WHERE product_id = ? AND id = ?', [update.newPriceMinor, now.toISOString(), update.productId, update.sizeId])
      await writeAudit(tx, now, {
        batchId,
        actor,
        action: 'price.bulk_update',
        productId: update.productId,
        productSizeId: update.sizeId,
        field: 'priceMinor',
        oldValue: oldPriceMinor,
        newValue: update.newPriceMinor,
        oldPriceMinor,
        newPriceMinor: update.newPriceMinor,
        note: note ?? null,
      })
    }
    await assertStillValid(tx)
  })
  return loadAdminCatalog(db)
}

// ---------------------------------------------------------------- revert

/**
 * Restores the price a specific audit entry recorded BEFORE its change —
 * i.e. undoes exactly that one price change. This writes a brand new audit
 * row (a normal `price.revert` change from the current price back to the old
 * one); it never edits or removes the history it is reverting.
 */
export async function revertPriceChange(db: Db, entryId: number, expectedVersion: number, actor: AdminUser, now: Date): Promise<AdminCatalog> {
  await withTx(db, async (tx) => {
    const entryRow = await queryOne(tx, 'SELECT * FROM catalog_audit_log WHERE id = ?', [entryId])
    if (!entryRow) throw errors.notFound('That price change')
    const entry = rowToAudit(entryRow as unknown as Record<string, unknown>)
    if (entry.oldPriceMinor === null || !entry.productSizeId) throw errors.badRequest('That change isn’t a price change, so it can’t be reverted.')

    const sizeRow = await requireSize(tx, entry.productId, entry.productSizeId)
    const currentVersion = Number(sizeRow.version)
    if (currentVersion !== expectedVersion) {
      throw new StaleVersionError({ productId: entry.productId, sizeId: entry.productSizeId, expectedVersion, currentVersion })
    }
    const currentPrice = Number(sizeRow.price_minor)
    await run(tx, 'UPDATE catalog_sizes SET price_minor = ?, version = version + 1, updated_at = ? WHERE product_id = ? AND id = ?', [entry.oldPriceMinor, now.toISOString(), entry.productId, entry.productSizeId])
    await writeAudit(tx, now, {
      batchId: `revert_${entryId}_${now.getTime()}`,
      actor,
      action: 'price.revert',
      productId: entry.productId,
      productSizeId: entry.productSizeId,
      field: 'priceMinor',
      oldValue: currentPrice,
      newValue: entry.oldPriceMinor,
      oldPriceMinor: currentPrice,
      newPriceMinor: entry.oldPriceMinor,
      note: `Reverted to the price from entry #${entryId}`,
    })
    await assertStillValid(tx)
  })
  return loadAdminCatalog(db)
}

