import { beforeEach, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/catalogRepo.ts'
import { apiFor, buildOrder, createOwner, createTestServer, loginOwner, orderHeaders, placeOrder, type Api, type OwnerSession, type TestServer } from '../test/harness.ts'

let server: TestServer
let api: Api
let session: OwnerSession

beforeEach(async () => {
  server = await createTestServer()
  api = apiFor(server)
  await createOwner(server, { email: 'owner@shop.example', password: 'a-strong-password-1' })
  ;({ session } = await loginOwner(server, 'owner@shop.example', 'a-strong-password-1'))
})

const auth = () => session.headers()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response): Promise<any> => r.json()
const get = async (path: string, headers?: Record<string, string>) => json(await api.get(path, headers))
const publicCatalog = () => get('/api/catalog')
const adminCatalog = () => get('/api/admin/catalog', auth())
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findSize = (catalog: any, productId: string, sizeId: string): any => catalog.products.find((p: { id: string }) => p.id === productId).sizes.find((s: { id: string }) => s.id === sizeId)

describe('GET /api/admin/dashboard', () => {
  it('summarises what is sellable, recent changes, and recent orders', async () => {
    const response = await api.get('/api/admin/dashboard', auth())
    expect(response.status).toBe(200)
    const dashboard = await json(response)
    expect(dashboard.activeProductCount).toBeGreaterThan(0)
    expect(dashboard.activeSkuCount).toBeGreaterThan(0)
    expect(dashboard.inactiveProductCount).toBe(0)
    expect(Array.isArray(dashboard.recentPriceChanges)).toBe(true)
    expect(Array.isArray(dashboard.recentOrders)).toBe(true)
  })
})

describe('GET /api/admin/catalog', () => {
  it('is the full catalog, including bookkeeping fields the customer catalog never shows', async () => {
    const catalog = await adminCatalog()
    const walnut = catalog.products.find((p: { id: string }) => p.id === 'walnut')
    expect(walnut.rowVersion).toBe(1)
    expect(walnut.sizes[0].rowVersion).toBe(1)
  })
})

describe('POST /api/admin/products', () => {
  it('creates a product (inactive until it has a size), validated by the server', async () => {
    const response = await api.post(
      '/api/admin/products',
      { id: 'silver-oak', name: 'Silver Oak', tagline: 'Cool tone', description: 'A silvery frame.', styleId: 'natural-oak', shipsWithMat: true, glassOptionIds: ['standard'], matOptionIds: ['none'] },
      auth(),
    )
    expect(response.status).toBe(201)
    const catalog = await publicCatalog()
    const created = catalog.products.find((p: { id: string }) => p.id === 'silver-oak')
    expect(created).toBeTruthy() // the customer catalog is truthful about it existing…
    expect(created.active).toBe(false) // …and that it isn't sellable yet
  })

  it('rejects a bad id with a field-level explanation, not a 500', async () => {
    const response = await api.post('/api/admin/products', { id: 'NOT VALID', name: 'x', tagline: 'x', description: 'x', styleId: 'x', shipsWithMat: true, glassOptionIds: ['standard'], matOptionIds: ['none'] }, auth())
    expect(response.status).toBe(400)
    const body = await json(response)
    expect(body.error.details.fields.some((f: { field: string }) => f.field === 'id')).toBe(true)
  })
})

describe('PATCH /api/admin/products/:id/sizes/:sizeId — the price change customers actually see', () => {
  it('a price change is visible on GET /api/catalog immediately, no rebuild or redeploy', async () => {
    const size = findSize(await adminCatalog(), 'walnut', '16x24')
    expect(size.priceMinor).toBe(99900)

    const patch = await api.patch('/api/admin/products/walnut/sizes/16x24', { expectedVersion: size.rowVersion, priceMinor: 109900 }, auth())
    expect(patch.status).toBe(200)

    expect(findSize(await publicCatalog(), 'walnut', '16x24').priceMinor).toBe(109900)
  })

  it('rejects a price above the sanity ceiling', async () => {
    const size = findSize(await adminCatalog(), 'walnut', '8x10')
    const response = await api.patch('/api/admin/products/walnut/sizes/8x10', { expectedVersion: size.rowVersion, priceMinor: 999_999_999 }, auth())
    expect(response.status).toBe(400)
  })

  it('rejects a negative or non-integer price', async () => {
    const size = findSize(await adminCatalog(), 'walnut', '8x10')
    const negative = await api.patch('/api/admin/products/walnut/sizes/8x10', { expectedVersion: size.rowVersion, priceMinor: -100 }, auth())
    expect(negative.status).toBe(400)
    const fractional = await api.patch('/api/admin/products/walnut/sizes/8x10', { expectedVersion: size.rowVersion, priceMinor: 100.5 }, auth())
    expect(fractional.status).toBe(400)
  })

  it('a save built on a stale rowVersion is a 409 naming the current value, not a silent overwrite', async () => {
    const size = findSize(await adminCatalog(), 'walnut', '8x10')
    const first = await api.patch('/api/admin/products/walnut/sizes/8x10', { expectedVersion: size.rowVersion, priceMinor: 60000 }, auth())
    expect(first.status).toBe(200)

    const second = await api.patch('/api/admin/products/walnut/sizes/8x10', { expectedVersion: size.rowVersion, priceMinor: 55000 }, auth())
    expect(second.status).toBe(409)
    const body = await json(second)
    expect(body.error.code).toBe('STALE_VERSION')
    expect(body.error.details.currentVersion).toBe(size.rowVersion + 1)

    expect(findSize(await publicCatalog(), 'walnut', '8x10').priceMinor).toBe(60000)
  })

  it('an unknown product or size is 404', async () => {
    const response = await api.patch('/api/admin/products/no-such-product/sizes/8x10', { expectedVersion: 1, priceMinor: 100 }, auth())
    expect(response.status).toBe(404)
  })
})

describe('PATCH /api/admin/prices/bulk', () => {
  it('changes several sizes in one request', async () => {
    const catalog = await adminCatalog()
    const a = findSize(catalog, 'walnut', '8x10')
    const b = findSize(catalog, 'walnut', '12x18')

    const response = await api.patch(
      '/api/admin/prices/bulk',
      {
        updates: [
          { productId: 'walnut', sizeId: a.id, newPriceMinor: 65000, expectedVersion: a.rowVersion },
          { productId: 'walnut', sizeId: b.id, newPriceMinor: 85000, expectedVersion: b.rowVersion },
        ],
      },
      auth(),
    )
    expect(response.status).toBe(200)
    const seen = await publicCatalog()
    expect(findSize(seen, 'walnut', a.id).priceMinor).toBe(65000)
    expect(findSize(seen, 'walnut', b.id).priceMinor).toBe(85000)
  })

  it('rejects an empty batch', async () => {
    const response = await api.patch('/api/admin/prices/bulk', { updates: [] }, auth())
    expect(response.status).toBe(400)
  })
})

describe('audit trail and revert', () => {
  it('lists price history for a size, newest first, and can revert one entry', async () => {
    const size = findSize(await adminCatalog(), 'walnut', '12x18')
    await api.patch('/api/admin/products/walnut/sizes/12x18', { expectedVersion: size.rowVersion, priceMinor: 80000 }, auth())

    const { entries } = await get('/api/admin/audit?productId=walnut&sizeId=12x18', auth())
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ oldPriceMinor: 69900, newPriceMinor: 80000, actorName: 'Owner' })

    const changedSize = findSize(await adminCatalog(), 'walnut', '12x18')
    const revert = await api.post(`/api/admin/audit/${entries[0].id}/revert`, { expectedVersion: changedSize.rowVersion }, auth())
    expect(revert.status).toBe(200)

    expect(findSize(await publicCatalog(), 'walnut', '12x18').priceMinor).toBe(69900)

    const historyAfter = await get('/api/admin/audit?productId=walnut&sizeId=12x18', auth())
    expect(historyAfter.entries).toHaveLength(2) // reverted AND recorded — never silently erased
  })
})

describe('GET /api/admin/orders', () => {
  it('lists orders with the full delivery address the customer view never shows', async () => {
    const built = await buildOrder(server)
    const { json: created } = await placeOrder(server, built)

    const list = await get('/api/admin/orders', auth())
    expect(list.orders.some((o: { publicOrderId: string }) => o.publicOrderId === created.order.publicOrderId)).toBe(true)

    const detail = await get(`/api/admin/orders/${created.order.publicOrderId}`, auth())
    expect(detail.order.delivery).toMatchObject({ line1: '12 MG Road, Indiranagar' })
    expect(detail.order.items[0]).toMatchObject({ productId: 'walnut' })
  })

  it('an unknown order is 404', async () => {
    const response = await api.get('/api/admin/orders/FRM-2026-999999', auth())
    expect(response.status).toBe(404)
  })
})

describe('an admin-driven price change never touches an existing order, and only future orders see it', () => {
  it('walks through the exact scenario: place an order, change the price, check the old order, place a new one', async () => {
    // 1 — a customer buys at today's price.
    const firstBuilt = await buildOrder(server, [{ productId: 'walnut', sizeId: '16x24' }], { key: 'idem-before-change-000001' })
    const firstOrder = await placeOrder(server, firstBuilt)
    expect(firstOrder.res.status).toBe(201)
    expect(firstOrder.json.order.totalMinor).toBeGreaterThan(0)
    const oldTotal = firstOrder.json.order.totalMinor

    // 2 — the owner raises the price.
    const size = findSize(await adminCatalog(), 'walnut', '16x24')
    expect(size.priceMinor).toBe(99900)
    await api.patch('/api/admin/products/walnut/sizes/16x24', { expectedVersion: size.rowVersion, priceMinor: 129900 }, auth())

    // 3 — the FIRST order's price is exactly what it was — the server never
    //     recalculates a placed order against the live catalog.
    const rereadOrder = (await get(`/api/orders/${firstOrder.json.order.publicOrderId}`, orderHeaders(firstBuilt.accessToken))).order
    expect(rereadOrder.totalMinor).toBe(oldTotal)
    expect(rereadOrder.items[0].unitPriceMinor).toBe(99900)

    // 4 — a customer who was still deciding at the OLD price is stopped, not
    //     silently charged the old amount.
    const staleAttempt = await placeOrder(server, await buildOrder(server, [{ productId: 'walnut', sizeId: '16x24' }], { key: 'idem-stale-attempt-000001' }))
    expect(staleAttempt.res.status).toBe(409)
    expect(staleAttempt.json.error.code).toBe('PRICE_CHANGED')

    // 5 — a customer designing AFTER the change pays the NEW price.
    const freshCatalog = await loadCatalog(server.ctx.db)
    const secondOrder = await placeOrder(server, await buildOrder(server, [{ productId: 'walnut', sizeId: '16x24' }], { catalog: freshCatalog, key: 'idem-after-change-000001' }))
    expect(secondOrder.res.status).toBe(201)
    expect(secondOrder.json.order.items[0].unitPriceMinor).toBe(129900)
    expect(secondOrder.json.order.totalMinor).toBeGreaterThan(oldTotal)

    // 6 — the owner's own order list shows each order at what it actually charged.
    const oldAdminView = await get(`/api/admin/orders/${firstOrder.json.order.publicOrderId}`, auth())
    expect(oldAdminView.order.items[0].unitPriceMinor).toBe(99900)
    const newAdminView = await get(`/api/admin/orders/${secondOrder.json.order.publicOrderId}`, auth())
    expect(newAdminView.order.items[0].unitPriceMinor).toBe(129900)
  })
})
