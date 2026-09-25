import { createHash } from 'node:crypto'
import { canonicalJson } from '../../shared/canonical.ts'
import { validateCatalog, type Catalog, type GlassOptionDef, type MatOptionDef, type ProductDef, type SizeDef } from '../../shared/catalog.ts'
import { query, run, withTx, type Db } from '../db/client.ts'

/**
 * The server owns the catalog: products, sizes, options, prices and the
 * delivery policy live in the database, seeded from `shared/catalogSeed.ts`.
 * Customers and the browser only ever read it (`GET /api/catalog`).
 *
 * The catalog `version` is a fingerprint of its content, so ANY change to a
 * price or product produces a new version automatically — the browser and
 * every order can say exactly which catalog they were priced against.
 */

export function catalogVersion(catalog: Omit<Catalog, 'version'> | Catalog): string {
  const { version: _ignored, ...content } = catalog as Catalog
  return createHash('sha256').update(canonicalJson(content)).digest('hex').slice(0, 12)
}

export async function isCatalogEmpty(db: Db): Promise<boolean> {
  const rows = await query(db, 'SELECT COUNT(*) AS n FROM catalog_products')
  return Number(rows[0].n) === 0
}

/** Replaces the whole stored catalog with `catalog`. Refuses an inconsistent one. */
export async function saveCatalog(db: Db, catalog: Catalog): Promise<string> {
  const problems = validateCatalog(catalog)
  if (problems.length > 0) throw new Error(`Refusing to save an invalid catalog:\n - ${problems.join('\n - ')}`)

  await withTx(db, async (tx) => {
    for (const table of ['catalog_product_options', 'catalog_sizes', 'catalog_products', 'catalog_mat_options', 'catalog_glass_options', 'catalog_settings']) {
      await run(tx, `DELETE FROM ${table}`)
    }
    const setting = (key: string, value: string) => run(tx, 'INSERT INTO catalog_settings (key, value) VALUES (?, ?)', [key, value])
    await setting('currency', catalog.currency)
    await setting('delivery_flat_fee_minor', String(catalog.delivery.flatFeeMinor))
    await setting('delivery_free_above_minor', catalog.delivery.freeAboveMinor === null ? '' : String(catalog.delivery.freeAboveMinor))
    await setting('delivery_note', catalog.delivery.note)

    for (const [i, g] of catalog.glassOptions.entries()) {
      await run(tx, 'INSERT INTO catalog_glass_options (id, name, description, priced, sort) VALUES (?, ?, ?, ?, ?)', [g.id, g.name, g.description, g.priced ? 1 : 0, i])
    }
    for (const [i, m] of catalog.matOptions.entries()) {
      await run(tx, 'INSERT INTO catalog_mat_options (id, name, description, has_mat, sort) VALUES (?, ?, ?, ?, ?)', [m.id, m.name, m.description, m.hasMat ? 1 : 0, i])
    }
    for (const [i, p] of catalog.products.entries()) {
      await run(
        tx,
        `INSERT INTO catalog_products (id, name, tagline, description, style_id, active, ships_with_mat, moulding_note, production_notes, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.name, p.tagline, p.description, p.styleId, p.active ? 1 : 0, p.shipsWithMat ? 1 : 0, p.mouldingNote ?? null, p.productionNotes ?? null, i],
      )
      for (const [j, s] of p.sizes.entries()) {
        await run(
          tx,
          `INSERT INTO catalog_sizes (product_id, id, width, height, unit, display_label, price_minor, glass_surcharge_minor, mat_surcharge_minor, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, s.id, s.width, s.height, s.unit, s.displayLabel, s.priceMinor, s.glassSurchargeMinor, s.matSurchargeMinor, j],
        )
      }
      for (const [j, id] of p.glassOptionIds.entries()) await run(tx, 'INSERT INTO catalog_product_options (product_id, kind, option_id, sort) VALUES (?, ?, ?, ?)', [p.id, 'glass', id, j])
      for (const [j, id] of p.matOptionIds.entries()) await run(tx, 'INSERT INTO catalog_product_options (product_id, kind, option_id, sort) VALUES (?, ?, ?, ?)', [p.id, 'mat', id, j])
    }
  })
  return catalogVersion(catalog)
}

/** Loads the stored catalog, with its content-derived version. */
export async function loadCatalog(db: Db): Promise<Catalog> {
  const settings = new Map((await query(db, 'SELECT key, value FROM catalog_settings')).map((r) => [String(r.key), String(r.value)]))
  const glassOptions: GlassOptionDef[] = (await query(db, 'SELECT * FROM catalog_glass_options ORDER BY sort')).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    priced: Number(r.priced) === 1,
  }))
  const matOptions: MatOptionDef[] = (await query(db, 'SELECT * FROM catalog_mat_options ORDER BY sort')).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    hasMat: Number(r.has_mat) === 1,
  }))

  const sizeRows = await query(db, 'SELECT * FROM catalog_sizes ORDER BY product_id, sort')
  const optionRows = await query(db, 'SELECT * FROM catalog_product_options ORDER BY product_id, kind, sort')

  const products: ProductDef[] = (await query(db, 'SELECT * FROM catalog_products ORDER BY sort')).map((r) => {
    const id = String(r.id)
    const sizes: SizeDef[] = sizeRows
      .filter((s) => String(s.product_id) === id)
      .map((s) => ({
        id: String(s.id),
        width: Number(s.width),
        height: Number(s.height),
        unit: 'in',
        displayLabel: String(s.display_label),
        priceMinor: Number(s.price_minor),
        glassSurchargeMinor: Number(s.glass_surcharge_minor),
        matSurchargeMinor: Number(s.mat_surcharge_minor),
      }))
    const optionIds = (kind: string) => optionRows.filter((o) => String(o.product_id) === id && String(o.kind) === kind).map((o) => String(o.option_id))
    return {
      id,
      name: String(r.name),
      tagline: String(r.tagline),
      description: String(r.description),
      styleId: String(r.style_id),
      active: Number(r.active) === 1,
      shipsWithMat: Number(r.ships_with_mat) === 1,
      ...(r.moulding_note ? { mouldingNote: String(r.moulding_note) } : {}),
      ...(r.production_notes ? { productionNotes: String(r.production_notes) } : {}),
      sizes,
      glassOptionIds: optionIds('glass'),
      matOptionIds: optionIds('mat'),
    }
  })

  const freeAbove = settings.get('delivery_free_above_minor') ?? ''
  const catalog: Catalog = {
    version: '',
    currency: settings.get('currency') ?? 'INR',
    glassOptions,
    matOptions,
    products,
    delivery: {
      flatFeeMinor: Number(settings.get('delivery_flat_fee_minor') ?? 0),
      freeAboveMinor: freeAbove === '' ? null : Number(freeAbove),
      note: settings.get('delivery_note') ?? '',
    },
  }
  catalog.version = catalogVersion(catalog)
  return catalog
}

/** What customers may see: everything except internal production notes. */
export function publicCatalog(catalog: Catalog): Catalog {
  return { ...catalog, products: catalog.products.map(({ productionNotes: _internal, ...product }) => product) }
}
