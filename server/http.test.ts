// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { SEED_CATALOG } from '../shared/catalogSeed.ts'
import { catalogVersion, isCatalogEmpty, loadCatalog, publicCatalog, saveCatalog } from './catalog/catalogRepo.ts'
import { query } from './db/client.ts'
import { apiFor, buildOrder, createTestServer, placeOrder } from './test/harness.ts'
import { jpegBytes, pngBytes } from './test/images.ts'
import { major } from '../shared/money.ts'

const upload = (server: Awaited<ReturnType<typeof createTestServer>>, bytes: Buffer, headers: Record<string, string> = {}) =>
  server.app.request('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers }, body: bytes })

describe('public endpoints', () => {
  it('health and config say what is running — and never expose a secret', async () => {
    const server = await createTestServer({ WHATSAPP_NUMBER: '+91 98765 43210' })
    const api = apiFor(server)
    expect(await (await api.get('/api/health')).json()).toMatchObject({ ok: true, env: 'test', paymentProvider: 'sandbox' })
    const config = (await (await api.get('/api/config')).json()) as any
    expect(config).toEqual({ paymentProvider: 'sandbox', sandbox: true, whatsappNumber: '919876543210' })
    expect(JSON.stringify(config)).not.toMatch(/secret/i)
  })

  it('serves the catalog with a content-derived version, without internal production notes', async () => {
    const server = await createTestServer()
    const withNotes = JSON.parse(JSON.stringify(SEED_CATALOG))
    withNotes.products[0].productionNotes = 'Cut on the 45 — supplier code X-19'
    await saveCatalog(server.ctx.db, withNotes)
    const res = await apiFor(server).get('/api/catalog')
    const body = (await res.json()) as any
    expect(res.status).toBe(200)
    expect(JSON.stringify(body)).not.toContain('supplier code')
    expect(body.version).toMatch(/^[0-9a-f]{12}$/)
    expect(body.products).toHaveLength(6)
    expect(body.products[0].sizes[0].priceMinor).toBeTypeOf('number')
  })

  it('unknown API routes get a JSON 404, not an HTML page', async () => {
    const server = await createTestServer()
    const res = await apiFor(server).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('every API response carries a request id and security headers', async () => {
    const server = await createTestServer()
    const res = await apiFor(server).get('/api/health')
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer') // order links carry a token
  })
})

describe('errors never leak', () => {
  it('an internal failure gives the customer a calm message and a reference — the real cause stays in the log', async () => {
    const server = await createTestServer()
    server.ctx.db.execute = (async () => { throw new Error('SQLITE_CORRUPT: database disk image is malformed at /var/db/shop.sqlite') }) as never
    const res = await apiFor(server).get('/api/catalog')
    const body = (await res.json()) as any
    expect(res.status).toBe(500)
    expect(body.error.code).toBe('INTERNAL')
    expect(body.error.requestId).toBeTruthy()
    expect(JSON.stringify(body)).not.toMatch(/SQLITE|corrupt|\/var\/db|Error:|\bat \w/i)
    const logged = server.logs.find((l) => l.event === 'request.failed')
    expect(logged).toMatchObject({ level: 'error', requestId: body.error.requestId })
    expect(String(logged!.message)).toContain('SQLITE_CORRUPT')
  })

  it('a failed payment-provider call says nothing was charged', async () => {
    const server = await createTestServer()
    const api = apiFor(server)
    const built = await buildOrder(server)
    const { json } = await placeOrder(server, built)
    server.ctx.payments = { name: 'sandbox', createPayment: async () => { throw new Error('ECONNRESET') }, parseWebhook: () => [] }
    const res = await api.post(`/api/orders/${json.order.publicOrderId}/payments`, undefined, { 'X-Order-Token': built.accessToken })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('ECONNRESET')
  })
})

describe('uploads', () => {
  it('accepts a photo and reports what it really is', async () => {
    const server = await createTestServer()
    const res = await upload(server, jpegBytes(4032, 3024, undefined, 50))
    const body = (await res.json()) as any
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ width: 4032, height: 3024, mime: 'image/jpeg' })
    expect(body.uploadId).toMatch(/^up_[0-9a-f]{32}$/)
  })

  it('is content-addressed: the same file twice is one upload (safe to retry)', async () => {
    const server = await createTestServer()
    const bytes = jpegBytes(1000, 800, undefined, 5)
    const a = (await (await upload(server, bytes)).json()) as any
    const b = (await (await upload(server, bytes)).json()) as any
    expect(a.uploadId).toBe(b.uploadId)
    expect(Number((await query(server.ctx.db, 'SELECT COUNT(*) AS n FROM uploads'))[0].n)).toBe(1)
    expect(server.storage.objects.size).toBe(1)
  })

  it('ignores the claimed Content-Type and filename — the bytes decide', async () => {
    const server = await createTestServer()
    const png = await upload(server, pngBytes(800, 600), { 'Content-Type': 'text/plain' })
    expect(((await png.json()) as any).mime).toBe('image/png')
    const lie = await upload(server, Buffer.from('<script>alert(1)</script>'), { 'Content-Type': 'image/jpeg' })
    expect(lie.status).toBe(422)
    expect(((await lie.json()) as any).error.code).toBe('UNSUPPORTED_IMAGE')
  })

  it('measures a sideways phone photo as it will be displayed', async () => {
    const server = await createTestServer()
    const body = (await (await upload(server, jpegBytes(4032, 3024, 6))).json()) as any
    expect(body).toMatchObject({ width: 3024, height: 4032 })
  })

  it('rejects an empty upload and an oversized one', async () => {
    const server = await createTestServer({ MAX_UPLOAD_BYTES: '5000' })
    expect((await upload(server, Buffer.alloc(0))).status).toBe(400)
    const big = await upload(server, jpegBytes(100, 100, undefined, 8000))
    expect(big.status).toBe(413)
    expect(((await big.json()) as any).error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('stores under a safe, content-derived key — never under a client-supplied name', async () => {
    const server = await createTestServer()
    await upload(server, pngBytes(640, 480, 3), { 'X-Filename': '../../etc/passwd' })
    const keys = [...server.storage.objects.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^uploads\/[0-9a-f]{2}\/[0-9a-f]{64}\.png$/)
  })
})

describe('protection against hammering', () => {
  it('slows a client who repeats an expensive call too fast', async () => {
    const server = await createTestServer({ RATE_LIMIT: 'on', RATE_LIMIT_MAX: '3' })
    const api = apiFor(server)
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await api.post('/api/orders', {}, { 'Idempotency-Key': 'idem-key-ratelimit01' })).status)
    expect(statuses.slice(0, 3).every((s) => s === 400)).toBe(true)
    expect(statuses.slice(3)).toEqual([429, 429])
  })

  it('does not limit reads of the catalog', async () => {
    const server = await createTestServer({ RATE_LIMIT: 'on', RATE_LIMIT_MAX: '2' })
    const api = apiFor(server)
    for (let i = 0; i < 10; i++) expect((await api.get('/api/catalog')).status).toBe(200)
  })
})

describe('browser lifecycle events', () => {
  it('logs only the two events we allow, with only the fields we allow', async () => {
    const server = await createTestServer()
    const api = apiFor(server)
    expect((await api.post('/api/events', { name: 'checkout.started', frames: 3, totalMinor: 209700 })).status).toBe(204)
    expect(server.logs.find((l) => l.event === 'checkout.started')).toMatchObject({ source: 'browser', frames: 3, totalMinor: 209700 })
    expect((await api.post('/api/events', { name: 'design.confirmed', frames: 1 })).status).toBe(204)
  })

  it('rejects anything else — no free-form data gets into the log', async () => {
    const server = await createTestServer()
    const api = apiFor(server)
    expect((await api.post('/api/events', { name: 'order.created' })).status).toBe(400)
    expect((await api.post('/api/events', { name: 'checkout.started', frames: 'lots' })).status).toBe(400)
    expect((await api.post('/api/events', { name: 'checkout.started', frames: -4 })).status).toBe(400)
    expect(server.logs.filter((l) => (l as any).source === 'browser')).toHaveLength(0)
  })
})

describe('the catalog store', () => {
  it('round-trips the seed exactly', async () => {
    const server = await createTestServer()
    const loaded = await loadCatalog(server.ctx.db)
    expect({ ...loaded, version: '' }).toEqual({ ...SEED_CATALOG, version: '' })
    expect(await isCatalogEmpty(server.ctx.db)).toBe(false)
  })

  it('any price change produces a different version; identical content the same one', async () => {
    const server = await createTestServer()
    const before = (await loadCatalog(server.ctx.db)).version
    const changed = JSON.parse(JSON.stringify(SEED_CATALOG))
    changed.products[0].sizes[0].priceMinor += 100
    await saveCatalog(server.ctx.db, changed)
    const after = (await loadCatalog(server.ctx.db)).version
    expect(after).not.toBe(before)
    await saveCatalog(server.ctx.db, SEED_CATALOG)
    expect((await loadCatalog(server.ctx.db)).version).toBe(before)
    expect(catalogVersion(SEED_CATALOG)).toBe(before)
  })

  it('refuses to save an inconsistent catalog, and leaves the stored one untouched', async () => {
    const server = await createTestServer()
    const bad = JSON.parse(JSON.stringify(SEED_CATALOG))
    bad.products[0].sizes[0].priceMinor = 12.5
    await expect(saveCatalog(server.ctx.db, bad)).rejects.toThrow(/invalid catalog/)
    expect((await loadCatalog(server.ctx.db)).products[0].sizes[0].priceMinor).toBe(major(449))
  })

  it('publicCatalog drops internal notes and nothing else', () => {
    const withNotes = JSON.parse(JSON.stringify(SEED_CATALOG))
    withNotes.products[0].productionNotes = 'secret'
    const pub = publicCatalog(withNotes)
    expect(pub.products[0]).not.toHaveProperty('productionNotes')
    expect(pub.products[0].name).toBe(withNotes.products[0].name)
  })
})
