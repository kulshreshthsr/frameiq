// @vitest-environment node
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { query } from '../db/client.ts'
import { apiFor, buildOrder, createTestServer, orderHeaders, placeOrder, type TestServer } from '../test/harness.ts'
import { generateProductionPackage } from './package.ts'

let server: TestServer

beforeEach(async () => {
  server = await createTestServer()
})

async function paidOrder(frames: Parameters<typeof buildOrder>[1]) {
  const api = apiFor(server)
  const built = await buildOrder(server, frames)
  const { json } = await placeOrder(server, built)
  const id = json.order.publicOrderId as string
  const started = (await (await api.post(`/api/orders/${id}/payments`, undefined, orderHeaders(built.accessToken))).json()) as any
  await api.post(`/api/sandbox/payments/${started.payment.paymentId}/succeed`)
  return { id, built }
}

const text = (id: string, file: string) => server.packages.objects.get(`${id}/${file}`)!.toString('utf8')

describe('the production package', () => {
  it('contains everything a manufacturer needs, under the public order id', async () => {
    const { id } = await paidOrder([{}, { sizeId: '16x24', glassId: 'premium' }, { photo: null }])
    const files = [...server.packages.objects.keys()].map((k) => k.replace(`${id}/`, '')).sort()
    expect(files).toEqual(['MANIFEST.json', 'SHEET.txt', 'design.json', 'order.json', 'photos/frame-01.jpg', 'photos/frame-02.jpg', 'preview.png', 'wall.jpg'])
  })

  it('order.json carries the customer, delivery, items at their sold prices, and timestamps', async () => {
    const { id, built } = await paidOrder([{}])
    const order = JSON.parse(text(id, 'order.json'))
    expect(order).toMatchObject({
      publicOrderId: id,
      customer: { name: 'Asha Rao', mobile: '+919876543210' },
      delivery: { city: 'Bengaluru', state: 'Karnataka', pin: '560038' },
      paymentStatus: 'paid',
      orderStatus: 'confirmed',
      totalMinor: built.totals.totalMinor,
    })
    expect(order.items[0]).toMatchObject({ productName: 'Classic Walnut', sizeLabel: '12 × 18 in', quantity: 1 })
    expect(order.createdAt).toBeTruthy()
    expect(order.paidAt).toBeTruthy()
    expect(order.packagedAt).toBeTruthy()
    expect(order.designDigest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('design.json is the exact snapshot that was ordered', async () => {
    const { id, built } = await paidOrder([{}])
    const design = JSON.parse(text(id, 'design.json'))
    expect(design.frames[0].photo.crop).toEqual(built.snapshot.frames[0].photo!.crop)
    expect(design.wall.widthCm).toBe(300)
  })

  it('the photos are the customer’s ORIGINAL uploads, byte for byte', async () => {
    const { id, built } = await paidOrder([{ photo: { width: 3000, height: 4500 } }])
    const uploadId = built.body.uploads.photos.asset_1
    const [row] = await query(server.ctx.db, 'SELECT storage_key FROM uploads WHERE id = ?', [uploadId])
    expect(server.packages.objects.get(`${id}/photos/frame-01.jpg`)!.equals(server.storage.objects.get(String(row.storage_key))!)).toBe(true)
  })

  it('the manifest lists every file with a checksum that matches its contents', async () => {
    const { id } = await paidOrder([{}, {}])
    const manifest = JSON.parse(text(id, 'MANIFEST.json'))
    expect(manifest.order).toBe(id)
    expect(manifest.files.length).toBeGreaterThanOrEqual(7)
    for (const file of manifest.files) {
      const data = server.packages.objects.get(`${id}/${file.path}`)!
      expect(file.bytes).toBe(data.length)
      expect(file.sha256).toBe(createHash('sha256').update(data).digest('hex'))
    }
  })

  it('the sheet explains, in plain language, what to make and where to send it', async () => {
    const { id } = await paidOrder([{}, { productId: 'gold', sizeId: '16x24', orientation: 'landscape', glassId: 'premium' }, { photo: null }])
    const sheet = text(id, 'SHEET.txt')
    expect(sheet).toContain(`PRODUCTION SHEET — ${id}`)
    expect(sheet).toContain('Asha Rao')
    expect(sheet).toContain('12 MG Road, Indiranagar')
    expect(sheet).toContain('Bengaluru, Karnataka 560038')
    expect(sheet).toContain('FRAME 1')
    expect(sheet).toContain('Classic Walnut') // the name it was SOLD under
    expect(sheet).toContain('Antique Gold')
    expect(sheet).toContain('24 × 16 in (landscape)')
    expect(sheet).toContain('premium')
    expect(sheet).toContain('photos/frame-01.jpg')
    expect(sheet).toMatch(/Crop\s+: x [\d.]+%, y [\d.]+%/)
    expect(sheet).toMatch(/Prints at\s+: \d+ pixels per inch/)
    expect(sheet).toContain('frame ordered empty') // frame 3 has no photo
    expect(sheet).toContain('print from these')
  })

  it('names products by what the customer bought, even if the catalog changed afterwards', async () => {
    const { id } = await paidOrder([{}])
    await query(server.ctx.db, "UPDATE catalog_products SET name = 'Renamed' WHERE id = 'walnut'")
    await generateProductionPackage(server.ctx, Number((await query(server.ctx.db, 'SELECT id FROM orders'))[0].id))
    expect(text(id, 'SHEET.txt')).toContain('Classic Walnut')
    expect(text(id, 'SHEET.txt')).not.toContain('Renamed')
  })

  it('regenerating produces the identical package (safe to re-run)', async () => {
    const { id } = await paidOrder([{}, {}])
    const before = new Map([...server.packages.objects].map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')]))
    await generateProductionPackage(server.ctx, Number((await query(server.ctx.db, 'SELECT id FROM orders'))[0].id))
    const after = new Map([...server.packages.objects].map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')]))
    expect(after).toEqual(before)
    expect(id).toMatch(/^FRM-/)
  })

  it('records where the package is, and when', async () => {
    const { id } = await paidOrder([{}])
    const [row] = await query(server.ctx.db, 'SELECT package_path, package_generated_at FROM orders')
    expect(row.package_path).toBe(id)
    expect(row.package_generated_at).toBeTruthy()
  })
})

describe('when packaging fails, the order is still paid', () => {
  it('a missing stored image is logged as an error but never un-pays the order', async () => {
    const api = apiFor(server)
    const built = await buildOrder(server, [{}])
    const { json } = await placeOrder(server, built)
    const id = json.order.publicOrderId as string
    server.storage.objects.clear() // the disk lost the uploads

    const started = (await (await api.post(`/api/orders/${id}/payments`, undefined, orderHeaders(built.accessToken))).json()) as any
    await api.post(`/api/sandbox/payments/${started.payment.paymentId}/succeed`)

    const view = ((await (await api.get(`/api/orders/${id}`, orderHeaders(built.accessToken))).json()) as any).order
    expect(view.paymentStatus).toBe('paid')
    expect(server.logs.some((l) => l.event === 'production_package.failed' && l.level === 'error')).toBe(true)
    expect((await query(server.ctx.db, 'SELECT package_path FROM orders'))[0].package_path).toBeNull()
  })
})
