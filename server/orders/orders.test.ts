// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { major } from '../../shared/money.ts'
import { SEED_CATALOG } from '../../shared/catalogSeed.ts'
import { saveCatalog } from '../catalog/catalogRepo.ts'
import { query, run } from '../db/client.ts'
import { jpegBytes } from '../test/images.ts'
import { apiFor, buildOrder, orderHeaders, placeOrder, type Api, type TestServer, createTestServer } from '../test/harness.ts'

let server: TestServer
let api: Api

beforeEach(async () => {
  server = await createTestServer()
  api = apiFor(server)
})

const rowCount = async (table: string) => Number((await query(server.ctx.db, `SELECT COUNT(*) AS n FROM ${table}`))[0].n)

describe('creating an order', () => {
  it('creates a pending order with a human-friendly public id and the server-computed price', async () => {
    const built = await buildOrder(server, [{}])
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(201)
    expect(json.order.publicOrderId).toBe('FRM-2026-000001')
    expect(json.order).toMatchObject({ paymentStatus: 'pending', orderStatus: 'pending_payment', currency: 'INR' })
    expect(json.order.subtotalMinor).toBe(major(699))
    expect(json.order.deliveryFeeMinor).toBe(major(149))
    expect(json.order.totalMinor).toBe(major(699 + 149))
    expect(json.replayed).toBe(false)
  })

  it('records each line with the names and prices it was bought at', async () => {
    const { json } = await placeOrder(server, await buildOrder(server, [{}, {}, { sizeId: '16x24' }]))
    const items = json.order.items
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ productName: 'Classic Walnut', sizeLabel: '12 × 18 in', quantity: 2, unitPriceMinor: major(699), lineTotalMinor: major(1398) })
    expect(items[1]).toMatchObject({ sizeLabel: '16 × 24 in', quantity: 1, unitPriceMinor: major(999) })
  })

  it('numbers orders sequentially within a year and restarts each year', async () => {
    const first = await placeOrder(server, await buildOrder(server, [{}], { key: 'idem-key-aaaaaaaaaa1' }))
    const second = await placeOrder(server, await buildOrder(server, [{}], { key: 'idem-key-aaaaaaaaaa2' }))
    expect(first.json.order.publicOrderId).toBe('FRM-2026-000001')
    expect(second.json.order.publicOrderId).toBe('FRM-2026-000002')
    server.clock.now = new Date('2027-01-02T00:00:00Z')
    const third = await placeOrder(server, await buildOrder(server, [{}], { key: 'idem-key-aaaaaaaaaa3' }))
    expect(third.json.order.publicOrderId).toBe('FRM-2027-000001')
  })

  it('never exposes internal ids, the token hash, or the full address to the customer view', async () => {
    const { json } = await placeOrder(server, await buildOrder(server))
    const text = JSON.stringify(json)
    expect(text).not.toMatch(/access_token|accessToken|token_hash|snapshot|idempotency/i)
    expect(text).not.toContain('MG Road') // street lines stay server-side
    expect(json.order.deliveryCity).toBe('Bengaluru')
    expect(Object.keys(json.order)).not.toContain('id')
  })

  it('accepts a full 24-frame wall', async () => {
    const { res } = await placeOrder(server, await buildOrder(server, Array.from({ length: 24 }, () => ({ sizeId: '8x10' }))))
    expect(res.status).toBe(201)
  })

  it('an order may include an empty frame (no photo)', async () => {
    const { res } = await placeOrder(server, await buildOrder(server, [{}, { photo: null }]))
    expect(res.status).toBe(201)
  })

  it('stores a deterministic digest of the design, independent of when it was made', async () => {
    const a = await buildOrder(server, [{}], { key: 'idem-key-digest000001' })
    const first = await placeOrder(server, a)
    server.clock.now = new Date('2026-06-01T00:00:00Z')
    const b = await buildOrder(server, [{}], { key: 'idem-key-digest000002' })
    const second = await placeOrder(server, b)
    expect(first.json.digest).toBe(second.json.digest)
    const c = await buildOrder(server, [{}], { key: 'idem-key-digest000003' })
    c.snapshot.frames[0].photo!.crop.x += 0.01
    const third = await placeOrder(server, c)
    expect(third.json.digest).not.toBe(first.json.digest)
  })
})

describe('reading an order back', () => {
  it('needs the access token — a wrong or missing token is indistinguishable from "no such order"', async () => {
    const built = await buildOrder(server)
    const { json } = await placeOrder(server, built)
    const id = json.order.publicOrderId

    const ok = await api.get(`/api/orders/${id}`, orderHeaders(built.accessToken))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(((await ok.json()) as any).order.publicOrderId).toBe(id)

    const wrong = await api.get(`/api/orders/${id}`, orderHeaders('W'.repeat(43)))
    const none = await api.get(`/api/orders/${id}`)
    const missing = await api.get('/api/orders/FRM-2026-999999', orderHeaders(built.accessToken))
    for (const res of [wrong, none, missing]) {
      expect(res.status).toBe(404)
      expect(((await res.json()) as any).error.code).toBe('NOT_FOUND')
    }
  })

  it('rejects malformed order ids outright', async () => {
    expect((await api.get('/api/orders/1', orderHeaders('x'))).status).toBe(404)
    expect((await api.get("/api/orders/FRM-2026-1'%20OR%201=1", orderHeaders('x'))).status).toBe(404)
  })

  it('stores only a hash of the token', async () => {
    const built = await buildOrder(server)
    await placeOrder(server, built)
    const [row] = await query(server.ctx.db, 'SELECT access_token_hash FROM orders')
    expect(String(row.access_token_hash)).not.toContain(built.accessToken)
    expect(String(row.access_token_hash)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('rejecting invalid orders', () => {
  const idem = { 'Idempotency-Key': 'idem-key-invalid00001' }

  it('unreadable JSON', async () => {
    const res = await server.app.request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...idem }, body: '{nope' })
    expect(res.status).toBe(400)
  })

  it('a missing or malformed idempotency key', async () => {
    const built = await buildOrder(server)
    expect((await api.post('/api/orders', built.body)).status).toBe(400)
    const bad = await api.post('/api/orders', built.body, { 'Idempotency-Key': 'short' })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as any).error.code).toBe('MISSING_IDEMPOTENCY_KEY')
  })

  it('reports which fields need attention, in customer language', async () => {
    const built = await buildOrder(server)
    built.body.customer = { name: '', mobile: '12' }
    built.body.delivery = { ...built.body.delivery, pin: 'abc', state: 'Atlantis' }
    const res = await api.post('/api/orders', built.body, idem)
    const json = (await res.json()) as any
    expect(res.status).toBe(400)
    const fields = json.error.details.fields.map((f: any) => f.field)
    expect(fields).toEqual(expect.arrayContaining(['customer.name', 'customer.mobile', 'delivery.pin', 'delivery.state']))
    expect(JSON.stringify(json)).not.toMatch(/zod|ZodError|stack|at .*\.ts/i)
  })

  it.each([
    ['no frames', (b: any) => (b.body.snapshot.frames = [])],
    ['too many frames', (b: any) => (b.body.snapshot.frames = Array.from({ length: 25 }, () => b.body.snapshot.frames[0]))],
    ['a negative price', (b: any) => (b.body.snapshot.pricing.totalMinor = -1)],
    ['a fractional price', (b: any) => (b.body.snapshot.pricing.totalMinor = 100.5)],
    ['an impossible wall width', (b: any) => (b.body.snapshot.wall.widthCm = 5)],
    ['an unknown schema version', (b: any) => (b.body.snapshot.schemaVersion = 99)],
    ['a malformed token', (b: any) => (b.body.accessToken = 'short')],
    ['a malformed upload id', (b: any) => (b.body.uploads.wall = '../../etc/passwd')],
    ['an invalid rotation', (b: any) => (b.body.snapshot.frames[0].photo.crop.rotationDeg = 45)],
    ['NaN-ish numbers', (b: any) => (b.body.snapshot.frames[0].geometry.x = 'abc')],
  ])('%s', async (_name, tamper) => {
    const built = await buildOrder(server)
    tamper(built)
    const res = await api.post('/api/orders', built.body, idem)
    expect(res.status).toBe(400)
    expect(await rowCount('orders')).toBe(0)
  })

  it('a body that is far too large', async () => {
    const res = await server.app.request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...idem }, body: JSON.stringify({ pad: 'x'.repeat(600_000) }) })
    expect(res.status).toBe(413)
  })

  it('unknown properties cannot smuggle in a price', async () => {
    const built = await buildOrder(server)
    ;(built.body as any).totalMinor = 1
    ;(built.body as any).order = { totalMinor: 1 }
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(201)
    expect(json.order.totalMinor).toBe(built.totals.totalMinor)
  })
})

describe('the server decides what things cost', () => {
  it('rejects a product that does not exist, telling the customer which frame', async () => {
    const built = await buildOrder(server, [{}, {}])
    built.snapshot.frames[1].productId = 'imaginary'
    built.snapshot.items = [{ productId: 'walnut', sizeId: '12x18', glassId: 'standard', matId: 'mat', quantity: 1 }, { productId: 'imaginary', sizeId: '12x18', glassId: 'standard', matId: 'mat', quantity: 1 }]
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(409)
    expect(json.error.code).toBe('ITEM_UNAVAILABLE')
    expect(json.error.message).toMatch(/Frame 2/)
    expect(json.error.details.catalogVersion).toBeTruthy()
  })

  it.each([
    ['a size the product does not come in', { sizeId: '99x99' }],
    ['a glass the product does not offer', { glassId: 'holographic' }],
    ['a mat option that does not exist', { matId: 'velvet' }],
  ])('rejects %s', async (_name, spec) => {
    const { res, json } = await placeOrder(server, await buildOrder(server, [spec as any]).catch(async () => {
      // buildOrder can't price an impossible spec; build a valid one and corrupt it.
      const built = await buildOrder(server, [{}])
      Object.assign(built.snapshot.frames[0], spec)
      Object.assign(built.snapshot.items[0], spec)
      return built
    }))
    expect([409, 422]).toContain(res.status)
    expect(json.error.code).toMatch(/ITEM_UNAVAILABLE|INVALID_ORDER/)
    expect(await rowCount('orders')).toBe(0)
  })

  it('rejects a product that has been retired since the customer designed', async () => {
    const built = await buildOrder(server, [{ productId: 'gold' }])
    await run(server.ctx.db, "UPDATE catalog_products SET active = 0 WHERE id = 'gold'")
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(409)
    expect(json.error.code).toBe('ITEM_UNAVAILABLE')
  })

  it.each([
    ['a lower total (someone editing the page)', 'totalMinor', 100],
    ['a lower subtotal', 'subtotalMinor', 1],
    ['a free delivery claim', 'deliveryFeeMinor', 0],
  ])('rejects %s, and tells the browser the real price', async (_name, field, value) => {
    const built = await buildOrder(server, [{}])
    ;(built.body.snapshot.pricing as any)[field] = value
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(409)
    expect(json.error.code).toBe('PRICE_CHANGED')
    expect(json.error.details.serverTotals.totalMinor).toBe(built.totals.totalMinor)
    expect(await rowCount('orders')).toBe(0)
  })

  it('rejects an item list that disagrees with the frames', async () => {
    const built = await buildOrder(server, [{}, {}])
    built.snapshot.items[0].quantity = 1
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(422)
    expect(json.error.code).toBe('INVALID_ORDER')
  })

  it('rejects a frame whose size does not match its catalog size', async () => {
    const built = await buildOrder(server)
    built.snapshot.frames[0].sizeIn = { width: 40, height: 60 }
    expect((await placeOrder(server, built)).res.status).toBe(422)
  })

  it('rejects an impossible visible opening', async () => {
    const built = await buildOrder(server)
    built.snapshot.frames[0].openingIn = { width: 50, height: 50 }
    expect((await placeOrder(server, built)).res.status).toBe(422)
  })

  it('rejects a crop that does not fully cover the frame (blank areas would be printed)', async () => {
    const built = await buildOrder(server)
    built.snapshot.frames[0].photo!.crop = { x: -0.2, y: 0, width: 1.1, height: 1, rotationDeg: 0 }
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(422)
    expect(json.error.message).toMatch(/cover/)
  })

  it('a mat added to a frame that ships without one is charged; a shipped mat is not', async () => {
    const withAddedMat = await buildOrder(server, [{ productId: 'matte-black', matId: 'mat' }], { key: 'idem-key-mat000000001' })
    const plain = await buildOrder(server, [{ productId: 'matte-black', matId: 'none' }], { key: 'idem-key-mat000000002' })
    const a = await placeOrder(server, withAddedMat)
    const b = await placeOrder(server, plain)
    expect(a.json.order.subtotalMinor - b.json.order.subtotalMinor).toBe(major(149))
  })
})

describe('historical prices are preserved', () => {
  it('yesterday’s order keeps yesterday’s price, name and size label after the catalog changes', async () => {
    const built = await buildOrder(server, [{}])
    const { json } = await placeOrder(server, built)
    const id = json.order.publicOrderId
    expect(json.order.items[0].unitPriceMinor).toBe(major(699))

    // Next month: the product costs more, and is renamed.
    const repriced = JSON.parse(JSON.stringify(SEED_CATALOG))
    const walnut = repriced.products.find((p: any) => p.id === 'walnut')
    walnut.sizes.find((s: any) => s.id === '12x18').priceMinor = major(1099)
    walnut.name = 'Walnut Deluxe'
    await saveCatalog(server.ctx.db, repriced)

    const again = await api.get(`/api/orders/${id}`, orderHeaders(built.accessToken))
    const order = ((await again.json()) as any).order
    expect(order.items[0]).toMatchObject({ productName: 'Classic Walnut', unitPriceMinor: major(699), lineTotalMinor: major(699) })
    expect(order.subtotalMinor).toBe(major(699))
    expect(order.totalMinor).toBe(built.totals.totalMinor)

    // …while a NEW order at the old price is refused, and shown the new one.
    const stale = await buildOrder(server, [{}], { key: 'idem-key-stale00000001' })
    const refused = await placeOrder(server, stale)
    expect(refused.res.status).toBe(409)
    expect(refused.json.error.code).toBe('PRICE_CHANGED')
    expect(refused.json.error.details.serverTotals.subtotalMinor).toBe(major(1099))
  })

  it('the stored snapshot and catalog version stay with the order', async () => {
    const built = await buildOrder(server)
    await placeOrder(server, built)
    const [row] = await query(server.ctx.db, 'SELECT catalog_version, snapshot_json FROM orders')
    expect(String(row.catalog_version)).toMatch(/^[0-9a-f]{12}$/)
    expect(JSON.parse(String(row.snapshot_json)).frames).toHaveLength(1)
  })
})

describe('production images', () => {
  it('refuses a photo too small to print sharply at the ordered size, and says which frame', async () => {
    const built = await buildOrder(server, [{ sizeId: '24x36', photo: { width: 900, height: 1350 } }])
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(422)
    expect(json.error.code).toBe('IMAGE_PROBLEMS')
    expect(json.error.message).toMatch(/frame 1/)
    expect(json.error.message).toMatch(/too small to print/)
    expect(json.error.details.problems[0]).toMatchObject({ frameNumber: 1, code: 'low_resolution', requiredPpi: 100 })
    expect(await rowCount('orders')).toBe(0)
  })

  it('accepts the same photo at a smaller size that it can support', async () => {
    const built = await buildOrder(server, [{ sizeId: '8x10', photo: { width: 900, height: 1350 } }])
    expect((await placeOrder(server, built)).res.status).toBe(201)
  })

  it('refuses when the original was never uploaded', async () => {
    const built = await buildOrder(server)
    built.body.uploads.photos = {}
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(422)
    expect(json.error.details.problems[0].code).toBe('missing')
  })

  it('refuses an upload id the server has never seen', async () => {
    const built = await buildOrder(server)
    built.body.uploads.photos = { asset_1: `up_${'0'.repeat(32)}` }
    expect((await placeOrder(server, built)).json.error.details.problems[0].code).toBe('missing')
  })

  it('refuses an upload that is a different shape from the photo designed with', async () => {
    const built = await buildOrder(server, [{ photo: { width: 3000, height: 4500 } }])
    const { storeUpload } = await import('../uploads/service.ts')
    const landscape = await storeUpload(server.ctx, jpegBytes(4500, 3000, undefined, 77))
    built.body.uploads.photos = { asset_1: landscape.uploadId }
    const { res, json } = await placeOrder(server, built)
    expect(res.status).toBe(422)
    expect(json.error.details.problems[0].code).toBe('wrong_shape')
  })

  it('reports every problem frame, not just the first', async () => {
    const built = await buildOrder(server, [{ sizeId: '24x36', photo: { width: 900, height: 1350 } }, { sizeId: '24x36', photo: { width: 800, height: 1200 } }])
    const { json } = await placeOrder(server, built)
    expect(json.error.details.problems).toHaveLength(2)
    expect(json.error.message).toMatch(/and 1 more/)
  })

  it('needs the wall photo and the design preview to have been uploaded', async () => {
    const noWall = await buildOrder(server)
    noWall.body.uploads.wall = `up_${'a'.repeat(32)}`
    expect((await placeOrder(server, noWall)).json.error.code).toBe('MISSING_UPLOAD')
    const noPreview = await buildOrder(server, [{}], { key: 'idem-key-nopreview0001' })
    noPreview.body.uploads.preview = `up_${'b'.repeat(32)}`
    expect((await placeOrder(server, noPreview)).json.error.code).toBe('MISSING_UPLOAD')
  })

  it('the design preview must be a PNG', async () => {
    const built = await buildOrder(server)
    built.body.uploads.preview = built.body.uploads.wall // a JPEG
    expect((await placeOrder(server, built)).res.status).toBe(422)
  })

  it('links every image to the order for the production package', async () => {
    await placeOrder(server, await buildOrder(server, [{}, {}]))
    const roles = (await query(server.ctx.db, 'SELECT role, COUNT(*) AS n FROM order_uploads GROUP BY role')).map((r) => `${r.role}:${r.n}`).sort()
    expect(roles).toEqual(['photo:2', 'preview:1', 'wall:1'])
  })
})

describe('idempotency — no duplicate orders', () => {
  it('the same request twice returns the same order, once', async () => {
    const built = await buildOrder(server)
    const first = await placeOrder(server, built)
    const second = await placeOrder(server, built)
    expect(first.res.status).toBe(201)
    expect(second.res.status).toBe(200)
    expect(second.json.replayed).toBe(true)
    expect(second.json.order.publicOrderId).toBe(first.json.order.publicOrderId)
    expect(await rowCount('orders')).toBe(1)
    expect(await rowCount('order_items')).toBe(1)
  })

  it('a burst of identical requests (a frantic double-click) still makes exactly one order', async () => {
    const built = await buildOrder(server)
    const results = await Promise.all(Array.from({ length: 6 }, () => placeOrder(server, built)))
    const ids = new Set(results.map((r) => r.json.order?.publicOrderId))
    expect(ids.size).toBe(1)
    expect(results.every((r) => r.res.status === 201 || r.res.status === 200)).toBe(true)
    expect(await rowCount('orders')).toBe(1)
    expect(await rowCount('order_items')).toBe(1)
    expect(await rowCount('order_counters')).toBe(1)
    expect(Number((await query(server.ctx.db, 'SELECT last FROM order_counters'))[0].last)).toBe(1) // no gaps burned
  })

  it('the same key with a DIFFERENT order is refused, not silently merged', async () => {
    const built = await buildOrder(server, [{}])
    await placeOrder(server, built)
    const different = await buildOrder(server, [{}, {}], { key: built.idempotencyKey })
    const { res, json } = await placeOrder(server, different)
    expect(res.status).toBe(409)
    expect(json.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect(await rowCount('orders')).toBe(1)
  })

  it('two genuinely separate orders with different keys are both created', async () => {
    await placeOrder(server, await buildOrder(server, [{}], { key: 'idem-key-separate00001' }))
    await placeOrder(server, await buildOrder(server, [{}], { key: 'idem-key-separate00002' }))
    expect(await rowCount('orders')).toBe(2)
  })

  it('a replay after the customer refreshes still works without the original response', async () => {
    const built = await buildOrder(server)
    await placeOrder(server, built)
    // The browser lost the response but kept its key and token.
    const again = await placeOrder(server, built)
    const view = await api.get(`/api/orders/${again.json.order.publicOrderId}`, orderHeaders(built.accessToken))
    expect(view.status).toBe(200)
  })
})

describe('cancelling', () => {
  it('cancels an unpaid order, repeatedly and safely', async () => {
    const built = await buildOrder(server)
    const { json } = await placeOrder(server, built)
    const id = json.order.publicOrderId
    const first = await api.post(`/api/orders/${id}/cancel`, undefined, orderHeaders(built.accessToken))
    const second = await api.post(`/api/orders/${id}/cancel`, undefined, orderHeaders(built.accessToken))
    expect(((await first.json()) as any).order.orderStatus).toBe('cancelled')
    expect(((await second.json()) as any).order.orderStatus).toBe('cancelled')
  })

  it('will not cancel for someone without the token', async () => {
    const { json } = await placeOrder(server, await buildOrder(server))
    const res = await api.post(`/api/orders/${json.order.publicOrderId}/cancel`, undefined, orderHeaders('W'.repeat(43)))
    expect(res.status).toBe(404)
  })
})

describe('logging around orders', () => {
  it('records the lifecycle without personal data', async () => {
    await placeOrder(server, await buildOrder(server))
    const created = server.logs.find((l) => l.event === 'order.created')
    expect(created).toMatchObject({ publicOrderId: 'FRM-2026-000001', frames: 1 })
    const everything = JSON.stringify(server.logs)
    expect(everything).not.toContain('9876543210')
    expect(everything).not.toContain('MG Road')
    expect(everything).not.toContain('Asha')
    expect(everything).not.toContain('T'.repeat(20)) // the access token
  })
})
