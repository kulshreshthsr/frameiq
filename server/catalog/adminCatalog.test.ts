import { beforeEach, describe, expect, it } from 'vitest'
import { createOwner, createTestServer, type TestServer } from '../test/harness.ts'
import { findUserByEmail, toAdminUser } from '../auth/users.ts'
import {
  bulkUpdatePrices,
  createProduct,
  createSize,
  findAuditEntry,
  listAudit,
  loadAdminCatalog,
  revertPriceChange,
  StaleVersionError,
  updateProduct,
  updateSize,
} from './adminCatalogRepo.ts'

let server: TestServer
let owner: ReturnType<typeof toAdminUser>

beforeEach(async () => {
  server = await createTestServer()
  await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
  owner = toAdminUser((await findUserByEmail(server.ctx.db, 'owner@shop.example'))!)
})

const now = () => new Date('2026-03-15T10:00:00.000Z')
const later = () => new Date('2026-03-16T10:00:00.000Z')

describe('loadAdminCatalog', () => {
  it('gives every product and size a starting rowVersion of 1, and its own updatedAt', async () => {
    const catalog = await loadAdminCatalog(server.ctx.db)
    const walnut = catalog.products.find((p) => p.id === 'walnut')!
    expect(walnut.rowVersion).toBe(1)
    expect(typeof walnut.updatedAt).toBe('string')
    const size = walnut.sizes.find((s) => s.id === '12x18')!
    expect(size.rowVersion).toBe(1)
    expect(size.active).toBe(true)
  })
})

describe('createProduct', () => {
  it('creates a new product, always inactive (it has no sizes yet)', async () => {
    const catalog = await createProduct(
      server.ctx.db,
      { id: 'silver-oak', name: 'Silver Oak', tagline: 'Cool tone', description: 'A silvery frame.', styleId: 'natural-oak', shipsWithMat: true, glassOptionIds: ['standard'], matOptionIds: ['none'] },
      owner,
      now(),
    )
    const created = catalog.products.find((p) => p.id === 'silver-oak')!
    expect(created.active).toBe(false)
    expect(created.sizes).toEqual([])
    const audit = await listAudit(server.ctx.db, { productId: 'silver-oak' })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'product.create', actorName: 'Owner' })
  })

  it('refuses a duplicate id', async () => {
    await expect(
      createProduct(server.ctx.db, { id: 'walnut', name: 'x', tagline: 'x', description: 'x', styleId: 'x', shipsWithMat: true, glassOptionIds: ['standard'], matOptionIds: ['none'] }, owner, now()),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ID' })
  })

  it('refuses an unknown glass or mat option', async () => {
    await expect(
      createProduct(server.ctx.db, { id: 'new-1', name: 'x', tagline: 'x', description: 'x', styleId: 'x', shipsWithMat: true, glassOptionIds: ['not-a-real-option'], matOptionIds: ['none'] }, owner, now()),
    ).rejects.toThrow(/no glass option/)
  })
})

describe('updateProduct', () => {
  it('changes fields and bumps the row version', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!
    const catalog = await updateProduct(server.ctx.db, 'walnut', { expectedVersion: before.rowVersion, tagline: 'A new tagline' }, owner, now())
    const after = catalog.products.find((p) => p.id === 'walnut')!
    expect(after.tagline).toBe('A new tagline')
    expect(after.rowVersion).toBe(before.rowVersion + 1)
  })

  it('writes nothing when nothing actually changed', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!
    await updateProduct(server.ctx.db, 'walnut', { expectedVersion: before.rowVersion, tagline: before.tagline }, owner, now())
    const after = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!
    expect(after.rowVersion).toBe(before.rowVersion)
  })

  it('rejects a save built on a stale version — the second tab', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!
    await updateProduct(server.ctx.db, 'walnut', { expectedVersion: before.rowVersion, name: 'Tab A wins' }, owner, now())
    await expect(updateProduct(server.ctx.db, 'walnut', { expectedVersion: before.rowVersion, name: 'Tab B, too late' }, owner, later())).rejects.toBeInstanceOf(StaleVersionError)
    const after = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!
    expect(after.name).toBe('Tab A wins') // never silently overwritten
  })

  it('refuses to deactivate a product’s only offered glass option down to nothing', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!
    await expect(updateProduct(server.ctx.db, 'walnut', { expectedVersion: before.rowVersion, glassOptionIds: ['not-real'] }, owner, now())).rejects.toThrow(/no glass option/)
  })

  it('unknown product is 404', async () => {
    await expect(updateProduct(server.ctx.db, 'no-such-product', { expectedVersion: 1, name: 'x' }, owner, now())).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('createSize / updateSize', () => {
  it('adds a size, then lets a new product with just that size be activated', async () => {
    await createProduct(server.ctx.db, { id: 'mini', name: 'Mini', tagline: 't', description: 'd', styleId: 'walnut', shipsWithMat: true, glassOptionIds: ['standard'], matOptionIds: ['none'] }, owner, now())
    await createSize(server.ctx.db, 'mini', { id: '5x7', width: 5, height: 7, displayLabel: '5 × 7 in', priceMinor: 29900 }, owner, now())
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'mini')!
    const catalog = await updateProduct(server.ctx.db, 'mini', { expectedVersion: before.rowVersion, active: true }, owner, now())
    expect(catalog.products.find((p) => p.id === 'mini')!.active).toBe(true)
  })

  it('refuses a size wider than it is tall (must be stored portrait)', async () => {
    await expect(createSize(server.ctx.db, 'walnut', { id: 'weird', width: 20, height: 10, displayLabel: 'x', priceMinor: 1000 }, owner, now())).rejects.toThrow(/portrait/)
  })

  it('refuses a duplicate size id on the same product', async () => {
    await expect(createSize(server.ctx.db, 'walnut', { id: '12x18', width: 12, height: 18, displayLabel: 'x', priceMinor: 1000 }, owner, now())).rejects.toMatchObject({ code: 'DUPLICATE_ID' })
  })

  it('changing a price writes an audit row with the old and new price', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!
    expect(before.priceMinor).toBe(69900)
    const catalog = await updateSize(server.ctx.db, 'walnut', '12x18', { expectedVersion: before.rowVersion, priceMinor: 74900 }, owner, now())
    const after = catalog.products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!
    expect(after.priceMinor).toBe(74900)
    expect(after.rowVersion).toBe(before.rowVersion + 1)

    const audit = await listAudit(server.ctx.db, { productId: 'walnut', sizeId: '12x18' })
    expect(audit[0]).toMatchObject({ action: 'size.update', field: 'priceMinor', oldPriceMinor: 69900, newPriceMinor: 74900, actorName: 'Owner' })
  })

  it('rejects a stale price update, leaving the current price untouched', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!
    await updateSize(server.ctx.db, 'walnut', '12x18', { expectedVersion: before.rowVersion, priceMinor: 74900 }, owner, now())
    await expect(updateSize(server.ctx.db, 'walnut', '12x18', { expectedVersion: before.rowVersion, priceMinor: 1 }, owner, later())).rejects.toBeInstanceOf(StaleVersionError)
    const after = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!
    expect(after.priceMinor).toBe(74900)
  })

  it('refuses to deactivate the last active size of an active product', async () => {
    await createProduct(server.ctx.db, { id: 'lonely', name: 'Lonely', tagline: 't', description: 'd', styleId: 'walnut', shipsWithMat: true, glassOptionIds: ['standard'], matOptionIds: ['none'] }, owner, now())
    await createSize(server.ctx.db, 'lonely', { id: 'only', width: 5, height: 7, displayLabel: '5 × 7', priceMinor: 1000 }, owner, now())
    const p = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'lonely')!
    await updateProduct(server.ctx.db, 'lonely', { expectedVersion: p.rowVersion, active: true }, owner, now())

    const size = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'lonely')!.sizes[0]
    await expect(updateSize(server.ctx.db, 'lonely', 'only', { expectedVersion: size.rowVersion, active: false }, owner, now())).rejects.toThrow(/inconsistent/)
    const after = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'lonely')!.sizes[0]
    expect(after.active).toBe(true) // the rejected write never took effect
  })
})

describe('bulkUpdatePrices', () => {
  it('applies several prices at once under one batch id', async () => {
    const catalog = await loadAdminCatalog(server.ctx.db)
    const a = catalog.products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '8x10')!
    const b = catalog.products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!

    const updated = await bulkUpdatePrices(
      server.ctx.db,
      [
        { productId: 'walnut', sizeId: '8x10', newPriceMinor: 60000, expectedVersion: a.rowVersion },
        { productId: 'walnut', sizeId: '12x18', newPriceMinor: 80000, expectedVersion: b.rowVersion },
      ],
      owner,
      now(),
      'Spring price update',
    )
    const walnut = updated.products.find((p) => p.id === 'walnut')!
    expect(walnut.sizes.find((s) => s.id === '8x10')!.priceMinor).toBe(60000)
    expect(walnut.sizes.find((s) => s.id === '12x18')!.priceMinor).toBe(80000)

    const audit = await listAudit(server.ctx.db, { productId: 'walnut' })
    const batchEntries = audit.filter((e) => e.action === 'price.bulk_update')
    expect(batchEntries).toHaveLength(2)
    expect(new Set(batchEntries.map((e) => e.batchId)).size).toBe(1) // one shared batch
    expect(batchEntries[0].note).toBe('Spring price update')
  })

  it('is all-or-nothing: one stale row means NONE of the batch is applied', async () => {
    const catalog = await loadAdminCatalog(server.ctx.db)
    const a = catalog.products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '8x10')!
    const b = catalog.products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!

    // Someone else changes `a` first.
    await updateSize(server.ctx.db, 'walnut', '8x10', { expectedVersion: a.rowVersion, priceMinor: 65000 }, owner, now())

    await expect(
      bulkUpdatePrices(
        server.ctx.db,
        [
          { productId: 'walnut', sizeId: '8x10', newPriceMinor: 60000, expectedVersion: a.rowVersion }, // stale
          { productId: 'walnut', sizeId: '12x18', newPriceMinor: 80000, expectedVersion: b.rowVersion }, // still fresh
        ],
        owner,
        later(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' })

    const after = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!
    expect(after.sizes.find((s) => s.id === '8x10')!.priceMinor).toBe(65000) // the earlier, real change
    expect(after.sizes.find((s) => s.id === '12x18')!.priceMinor).toBe(69900) // UNCHANGED — nothing partial
  })
})

describe('revertPriceChange', () => {
  it('restores the price from before a specific change, and adds new history rather than erasing it', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!
    await updateSize(server.ctx.db, 'walnut', '12x18', { expectedVersion: before.rowVersion, priceMinor: 80000 }, owner, now())
    const entry = (await listAudit(server.ctx.db, { productId: 'walnut', sizeId: '12x18' }))[0]
    expect(entry.newPriceMinor).toBe(80000)
    expect(entry.oldPriceMinor).toBe(69900)

    const changed = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!
    const reverted = await revertPriceChange(server.ctx.db, entry.id, changed.rowVersion, owner, later())
    expect(reverted.products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!.priceMinor).toBe(69900)

    const history = await listAudit(server.ctx.db, { productId: 'walnut', sizeId: '12x18' })
    expect(history).toHaveLength(2) // the original change is still there…
    expect(history[0]).toMatchObject({ action: 'price.revert', newPriceMinor: 69900 }) // …plus a new forward entry, newest first
    expect(history[1]).toMatchObject({ action: 'size.update', newPriceMinor: 80000 })
  })

  it('a stale revert (the size changed again meanwhile) is refused', async () => {
    const before = (await loadAdminCatalog(server.ctx.db)).products.find((p) => p.id === 'walnut')!.sizes.find((s) => s.id === '12x18')!
    await updateSize(server.ctx.db, 'walnut', '12x18', { expectedVersion: before.rowVersion, priceMinor: 80000 }, owner, now())
    const entry = (await listAudit(server.ctx.db, { productId: 'walnut', sizeId: '12x18' }))[0]
    await expect(revertPriceChange(server.ctx.db, entry.id, before.rowVersion, owner, later())).rejects.toBeInstanceOf(StaleVersionError)
  })

  it('refuses to revert an entry that isn’t a price change', async () => {
    await createProduct(server.ctx.db, { id: 'x1', name: 'x', tagline: 't', description: 'd', styleId: 'walnut', shipsWithMat: true, glassOptionIds: ['standard'], matOptionIds: ['none'] }, owner, now())
    const entry = (await listAudit(server.ctx.db, { productId: 'x1' }))[0]
    await expect(revertPriceChange(server.ctx.db, entry.id, 1, owner, now())).rejects.toThrow(/can.t be reverted/)
  })

  it('an unknown entry id is 404', async () => {
    await expect(revertPriceChange(server.ctx.db, 999999, 1, owner, now())).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await findAuditEntry(server.ctx.db, 999999)).toBeNull()
  })
})
