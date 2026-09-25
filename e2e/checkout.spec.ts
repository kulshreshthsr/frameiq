import { expect, test } from '@playwright/test'
import { watchForErrors } from './support/journey'
import {
  ADDRESS,
  TWO_FRAME_TOTAL,
  choosePaymentOutcome,
  confirmDesign,
  continueToOrder,
  db,
  designWall,
  expectConfirmation,
  fillDelivery,
  fillDetails,
  packageFile,
  pay,
  reachPayment,
  signedSandboxWebhook,
  tokenFromUrl,
} from './support/checkout'

test.describe('ordering', () => {
  test('a customer designs a wall, checks out, pays (sandbox) and gets a confirmed order', async ({ page }) => {
    const errors = watchForErrors(page)
    await designWall(page)

    // 1 · Continue to order → a frozen review of exactly what will be made.
    await continueToOrder(page)
    await expect(page.getByRole('img', { name: 'Your framed wall' })).toBeVisible()
    await expect(page.getByRole('region', { name: '2 frames' })).toBeVisible()
    await expect(page.getByText('Classic Walnut').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByRole('region', { name: '2 frames' }).getByText('8 × 10 in').first()).toBeVisible()
    await expect(page.getByText(`Total ${TWO_FRAME_TOTAL} including delivery`)).toBeVisible()
    await confirmDesign(page)

    // 2 · Details — errors appear after leaving a field, in plain words.
    await page.getByTestId('field-name').fill('A')
    await page.getByTestId('field-mobile').fill('12345')
    await page.getByTestId('details-continue').click()
    await expect(page.getByText('Please enter your name.')).toBeVisible()
    await expect(page.getByText('Enter a 10-digit mobile number, like 98765 43210.')).toBeVisible()
    await fillDetails(page)

    // 3 · Delivery.
    await page.getByTestId('field-pin').fill('1234')
    await page.getByTestId('delivery-continue').click()
    await expect(page.getByText('A PIN code is 6 digits, like 560001.')).toBeVisible()
    await expect(page.getByText('Please choose your state.')).toBeVisible()
    await fillDelivery(page)

    // 4 · Payment: test mode is labelled, the recap is right, and the total is exact.
    await expect(page.getByTestId('test-mode')).toContainText('No real money')
    await expect(page.getByText('Asha Rao · 98765 43210')).toBeVisible()
    await expect(page.getByText('Bengaluru, Karnataka 560038').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByTestId('pay-button')).toHaveText(`Pay ${TWO_FRAME_TOTAL}`)
    await pay(page)
    await choosePaymentOutcome(page, 'succeed')

    // 5 · Confirmation.
    const orderId = await expectConfirmation(page)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('officially on its way to becoming real')
    await expect(page.getByTestId('confirm-total')).toHaveText(TWO_FRAME_TOTAL)
    await expect(page.getByText('Bengaluru, Karnataka 560038').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByTestId('whatsapp')).toHaveAttribute('href', new RegExp(`^https://wa\\.me/910000000000\\?text=.*${orderId}`))
    expect(new URL(page.url()).pathname).toBe(`/order/${orderId}`)

    // 6 · The server really holds a paid order, with a production package.
    const api = await page.request.get(`/api/orders/${orderId}`, { headers: { 'X-Order-Token': tokenFromUrl(page) } })
    const order = ((await api.json()) as any).order
    expect(order).toMatchObject({ paymentStatus: 'paid', orderStatus: 'confirmed', totalMinor: 114700, deliveryCity: 'Bengaluru' })
    const sheet = packageFile(orderId, 'SHEET.txt')
    expect(sheet).toContain(`PRODUCTION SHEET — ${orderId}`)
    expect(sheet).toContain('Classic Walnut')
    expect(sheet).toContain('12 MG Road, Indiranagar')
    expect(packageFile(orderId, 'design.json')).toContain('"crop"')
    expect(packageFile(orderId, 'MANIFEST.json')).toContain('photos/frame-01.png')

    // 7 · The designer has let go of the finished design.
    await page.getByTestId('another-design').click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('framed on your own wall')
    expect(errors()).toEqual([])
  })

  test('the design is frozen once checkout begins, and can be edited from Review', async ({ page }) => {
    await designWall(page)
    await continueToOrder(page)
    await expect(page.getByRole('button', { name: /Choose a layout|Photos|Wall/ })).toHaveCount(0) // the editor is not here
    await page.getByTestId('back-to-design').click()
    await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible()
    // Change the design, and order again: the new total reflects it.
    await page.getByRole('button', { name: /Step 5: Size & price/ }).click()
    await page.getByTestId('size-12x18').click()
    await page.getByRole('button', { name: /Step 6: Preview/ }).click()
    await page.getByTestId('primary-action').click()
    await expect(page.getByRole('heading', { name: 'Review your design' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('region', { name: '2 frames' }).getByText('12 × 18 in').first()).toBeVisible()
  })

  test('a photo too small to print blocks confirmation, and the customer can fix it', async ({ page }) => {
    // 24 × 36 in from a 1600 × 1200 photo would print at well under 100 pixels per inch.
    await designWall(page, { layout: 'single-hero', photos: 1, size: '24x36' })
    await continueToOrder(page)
    const alert = page.getByRole('alert').filter({ hasText: 'too small to print sharply' })
    await expect(alert).toBeVisible()
    await expect(alert).toContainText(/pixels per inch/)
    await expect(alert).toContainText(/at least 100/)
    await expect(page.getByTestId('confirm-design')).toBeDisabled()

    // "Change the size" takes them back to the design.
    await alert.getByRole('button', { name: 'Change the size' }).click()
    await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible()
    await page.getByRole('button', { name: /Step 5: Size & price/ }).click()
    await page.getByTestId('size-8x10').click()
    await page.getByRole('button', { name: /Step 6: Preview/ }).click()
    await page.getByTestId('primary-action').click()
    await expect(page.getByRole('heading', { name: 'Review your design' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('confirm-design')).toBeEnabled()
  })

  test('the ordering system being unreachable is explained calmly, and the design is safe', async ({ page }) => {
    await designWall(page)
    await page.route('**/api/catalog', (route) => route.abort())
    await page.getByTestId('primary-action').click()
    await expect(page.getByRole('alert').filter({ hasText: 'can’t reach our ordering system' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible() // still there
    await page.unroute('**/api/catalog')
    await continueToOrder(page) // and it works when the connection returns
  })
})

test.describe('payment outcomes', () => {
  test('a declined payment says nothing was charged and lets the customer try again', async ({ page }) => {
    await reachPayment(page)
    await pay(page)
    await choosePaymentOutcome(page, 'fail')
    const failed = page.getByTestId('payment-failed')
    await expect(failed).toContainText('didn’t go through')
    await expect(failed).toContainText('Nothing was charged')
    await expect(page.getByTestId('pay-button')).toHaveText('Try payment again')

    await page.getByTestId('pay-button').click()
    await choosePaymentOutcome(page, 'succeed')
    await expectConfirmation(page)
  })

  test('closing the payment window leaves the order safe, with a clear way to continue', async ({ page }) => {
    await reachPayment(page)
    await pay(page)
    await choosePaymentOutcome(page, 'cancel')
    await expect(page.getByTestId('payment-cancelled')).toContainText('You haven’t been charged')
    await page.getByTestId('pay-button').click()
    await choosePaymentOutcome(page, 'succeed')
    await expectConfirmation(page)
  })

  test('pressing Pay repeatedly creates ONE order and opens ONE payment', async ({ page }) => {
    const orderPosts: string[] = []
    const paymentPosts: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'POST') return
      if (/\/api\/orders$/.test(request.url())) orderPosts.push(request.url())
      if (/\/api\/orders\/[^/]+\/payments$/.test(request.url())) paymentPosts.push(request.url())
    })
    await reachPayment(page)
    const button = page.getByTestId('pay-button')
    await button.dblclick()
    await button.click({ force: true }).catch(() => undefined)
    await choosePaymentOutcome(page, 'succeed')
    await expectConfirmation(page)
    expect(orderPosts).toHaveLength(1)
    expect(paymentPosts).toHaveLength(1)
  })
})

test.describe('recovery — "did I just pay or not?"', () => {
  test('refreshing in the middle of checkout brings the customer back to the same place, with their answers', async ({ page }) => {
    await designWall(page)
    await continueToOrder(page)
    await confirmDesign(page)
    await fillDetails(page)
    await page.getByTestId('field-line1').fill(ADDRESS.line1)
    await page.getByTestId('field-city').fill('Bengaluru')
    await page.waitForTimeout(500) // let it save

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Delivery' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('field-line1')).toHaveValue(ADDRESS.line1)
    await expect(page.getByTestId('field-city')).toHaveValue('Bengaluru')
    await page.getByTestId('back-to-design').click() // and the design itself is intact behind it
    await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible()
  })

  test('refreshing while the payment window is open does not lose or duplicate the order', async ({ page }) => {
    await reachPayment(page)
    await pay(page)
    await expect(page.getByTestId('sandbox-succeed')).toBeVisible({ timeout: 45_000 })
    // (the summary that shows the ID is collapsed on phones, so read it from the saved checkout)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('framengine.checkout') ?? '{}').publicOrderId ?? null)).toMatch(/^FRM-/)
    const idBefore = (await page.evaluate(() => JSON.parse(localStorage.getItem('framengine.checkout')!).publicOrderId)) as string

    await page.reload() // the payment window is gone
    await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible({ timeout: 30_000 })
    // After a moment the page settles on a safe state, names the order, and offers a way on.
    await expect(page.getByTestId('unconfirmed')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('unconfirmed')).toContainText(idBefore)
    await page.getByTestId('reopen-payment').click()
    await choosePaymentOutcome(page, 'succeed')
    expect(await expectConfirmation(page)).toBe(idBefore) // the SAME order
  })

  test('paying while the browser is closed: the confirmation is waiting when they come back', async ({ page }) => {
    await reachPayment(page)
    const started = page.waitForResponse((r) => /\/api\/orders\/FRM-[\d-]+\/payments$/.test(r.url()) && r.request().method() === 'POST')
    await pay(page)
    const payment = ((await (await started).json()) as any).payment
    await expect(page.getByTestId('sandbox-succeed')).toBeVisible({ timeout: 45_000 })
    const orderId = payment.order.publicOrderId as string

    // The gateway reports success by webhook while the customer's tab is closed.
    await page.close()
    const provider = payment.clientPayload.providerOrderId as string
    const { body, signature } = signedSandboxWebhook({ eventId: `evt-closed-${orderId}`, type: 'payment.succeeded', providerOrderId: provider, amountMinor: payment.amountMinor, currency: 'INR' })
    const context = page.context()
    const delivered = await context.request.post('/api/webhooks/sandbox', { data: body, headers: { 'Content-Type': 'application/json', 'x-sandbox-signature': signature } })
    expect(((await delivered.json()) as any).results).toEqual(['applied'])
    // …and the same webhook again (a retry from the gateway) is harmless.
    const replay = await context.request.post('/api/webhooks/sandbox', { data: body, headers: { 'Content-Type': 'application/json', 'x-sandbox-signature': signature } })
    expect(replay.status()).toBe(200)
    expect(((await replay.json()) as any).results).toEqual(['duplicate'])

    // They reopen the site: checkout resumes and shows the paid order.
    const again = await context.newPage()
    await again.goto('/')
    await expect(again.getByTestId('confirmation')).toBeVisible({ timeout: 30_000 })
    await expect(again.getByTestId('order-id')).toHaveText(orderId)
    await expect(again.getByTestId('confirm-total')).toHaveText(TWO_FRAME_TOTAL)
  })

  test('the private order link works on another device — and a wrong link is refused kindly', async ({ page, browser }) => {
    await reachPayment(page)
    await pay(page)
    await choosePaymentOutcome(page, 'succeed')
    const orderId = await expectConfirmation(page)
    const link = page.url()

    // A completely fresh browser (no saved state at all) opens the link.
    const other = await browser.newContext()
    const phone = await other.newPage()
    await phone.goto(link)
    await expect(phone.getByTestId('confirmation')).toBeVisible({ timeout: 30_000 })
    await expect(phone.getByTestId('order-id')).toHaveText(orderId)
    await expect(phone.getByTestId('confirm-total')).toHaveText(TWO_FRAME_TOTAL)

    // Someone guessing an order id without its token gets nothing.
    const stranger = await other.newPage()
    await stranger.goto(`/order/${orderId}?t=${'x'.repeat(43)}`)
    await expect(stranger.getByRole('alert').filter({ hasText: 'couldn’t find that order' })).toBeVisible()
    await expect(stranger.getByRole('heading', { level: 1 })).toContainText('framed on your own wall')
    await other.close()
  })

  test('a price change while deciding is caught, explained, and re-confirmed — never silently charged', async ({ page }) => {
    // dark-brown is used by no other test, so changing its price can't disturb them.
    await reachPayment(page, { product: 'dark-brown' })
    const client = db()
    await client.execute("UPDATE catalog_sizes SET price_minor = price_minor + 10000 WHERE product_id = 'dark-brown' AND id = '8x10'")
    try {
      await pay(page)
      const error = page.getByTestId('payment-error')
      await expect(error).toHaveAttribute('data-code', 'PRICE_CHANGED', { timeout: 45_000 })
      await expect(error).toContainText('The price has changed')
      await expect(error).toContainText('Nothing was charged')
      // 2 × (₹499 + ₹100) + ₹149 = ₹1,347
      await expect(error).toContainText('₹1,347')

      await page.getByTestId('pay-button').click() // "Review the new price"
      await expect(page.getByRole('heading', { name: 'Review your design' })).toBeVisible()
      await expect(page.getByTestId('checkout-total').first()).toHaveText('₹1,347')
      await confirmDesign(page)
      await page.getByTestId('details-continue').click() // details were kept
      await page.getByTestId('delivery-continue').click()
      await expect(page.getByTestId('pay-button')).toHaveText('Pay ₹1,347')
      await pay(page)
      await choosePaymentOutcome(page, 'succeed')
      await expect(page.getByTestId('confirm-total')).toHaveText('₹1,347')
      await expectConfirmation(page)
    } finally {
      await client.execute("UPDATE catalog_sizes SET price_minor = price_minor - 10000 WHERE product_id = 'dark-brown' AND id = '8x10'")
      client.close()
    }
  })
})

