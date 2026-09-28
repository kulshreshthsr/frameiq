import { expect, test } from '@playwright/test'
import { activateProduct, addSize, createProduct, loginAsOwner, OWNER_EMAIL, setSizePrice } from './support/admin'
import { choosePaymentOutcome, confirmDesign, continueToOrder, designWall, expectConfirmation, fillDelivery, fillDetails, pay } from './support/checkout'
import { addPhotos, chooseLayout, next, openApp, uploadWall } from './support/journey'

/**
 * The owner admin, end to end: sign in, create and price a product, change
 * one price and then several at once, and confirm the two things the whole
 * feature exists to guarantee — a customer sees the new price immediately,
 * and an order already placed keeps exactly what it was charged.
 *
 * Everything here uses a product created just for this test (`e2e-frame`),
 * so it can never collide with another spec's price assumptions.
 */

test.describe('owner admin', () => {
  test('rejects a wrong password, plainly', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByTestId('login-email').fill(OWNER_EMAIL)
    await page.getByTestId('login-password').fill('not the right password')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('login-error')).toContainText('Incorrect email or password')
    await expect(page.getByTestId('dashboard')).toHaveCount(0)
  })

  test('the customer configurator never shows the admin, and vice versa', async ({ page }) => {
    await openApp(page)
    await expect(page.getByText('Admin', { exact: false })).toHaveCount(0)
    await page.goto('/admin')
    await expect(page.getByTestId('login-form')).toBeVisible()
  })

  test('create → price → sell → change price → old order unaffected, new order uses the new price', async ({ page, browser }, testInfo) => {
    // A fresh id per run: several projects (desktop/mobile/tablet) share one
    // database in a single Playwright run, and a retry re-runs this same
    // test — so a fixed id would collide with an earlier attempt's product.
    const PRODUCT_ID = `e2e-frame-${testInfo.project.name}-${testInfo.retry}-${Math.random().toString(36).slice(2, 8)}`

    // 1 — sign in and land on the dashboard.
    await loginAsOwner(page)

    // 2 — create a product (starts inactive), give it a size, activate it.
    await createProduct(page, { id: PRODUCT_ID, name: 'E2E Frame', tagline: 'For automated testing', description: 'A product that exists only for the admin end-to-end test.', styleId: 'walnut' })
    await expect(page.getByTestId('toggle-active')).toHaveText('Activate')
    await addSize(page, { id: '8x10', displayLabel: '8 × 10 in', width: 8, height: 10, priceRupees: 500 })
    await activateProduct(page)

    // 3 — a customer designs with it and pays, at ₹500 + ₹149 delivery.
    const customer = await browser.newContext()
    const shopper = await customer.newPage()
    await openApp(shopper)
    await uploadWall(shopper, 'living-room')
    await next(shopper)
    await chooseLayout(shopper, 'single-hero')
    await next(shopper)
    await addPhotos(shopper, 1, [[1600, 1200]])
    await next(shopper)
    await shopper.getByTestId(`product-${PRODUCT_ID}`).click()
    await next(shopper)
    await shopper.getByTestId('size-8x10').click()
    await expect(shopper.getByTestId('quote-total')).toHaveText('₹500') // design-time price is the frame subtotal; delivery is added at checkout
    await next(shopper)
    await continueToOrder(shopper)
    await confirmDesign(shopper)
    await fillDetails(shopper)
    await fillDelivery(shopper)
    await expect(shopper.getByTestId('pay-button')).toHaveText('Pay ₹649')
    await pay(shopper)
    await choosePaymentOutcome(shopper, 'succeed')
    const firstOrderId = await expectConfirmation(shopper)
    await expect(shopper.getByTestId('confirm-total')).toHaveText('₹649')
    const firstOrderLink = shopper.url()

    // 4 — the owner raises the price for one size…
    await page.goto(`/admin/products/${PRODUCT_ID}`)
    await setSizePrice(page, '8x10', 650)
    await expect(page.getByTestId('price-input-8x10')).toHaveValue('650')

    // …adds a second size, then changes BOTH at once with the bulk tool.
    await addSize(page, { id: '12x18', displayLabel: '12 × 18 in', width: 12, height: 18, priceRupees: 900 })
    await page.goto('/admin/catalog/bulk')
    await page.getByTestId(`bulk-row-${PRODUCT_ID}-8x10`).getByRole('checkbox').check()
    await page.getByTestId(`bulk-row-${PRODUCT_ID}-12x18`).getByRole('checkbox').check()
    await page.getByLabel('Adjustment type').selectOption('fixed')
    await page.getByTestId('adjustment-amount').fill('50')
    await page.getByTestId('preview-adjustment').click()
    await expect(page.getByTestId(`new-price-${PRODUCT_ID}-8x10`)).toHaveValue('700')
    await expect(page.getByTestId(`new-price-${PRODUCT_ID}-12x18`)).toHaveValue('950')
    await page.getByTestId('review-changes').click()
    await expect(page.getByTestId('review-table')).toContainText('₹700')
    await page.getByTestId('apply-changes').click()
    await expect(page.getByText('Updated 2 prices.')).toBeVisible()

    // 5 — the price history for this size shows every change (its creation,
    //     the single edit, and the bulk edit), newest first — nothing erased.
    await page.goto(`/admin/products/${PRODUCT_ID}`)
    await page.getByTestId('history-8x10').click()
    const history = page.getByTestId('price-history')
    await expect(history.getByTestId(/history-entry-/)).toHaveCount(3)
    await expect(history.locator('[data-testid^="history-entry-"]').first()).toContainText('₹650 → ₹700')
    await page.getByTestId('close-history').click()

    // 6 — a customer opening the configurator now sees the NEW price, with no
    //     rebuild or redeploy — and their order is charged that new price.
    const customer2 = await browser.newContext()
    const shopper2 = await customer2.newPage()
    await designWall(shopper2, { layout: 'single-hero', photos: 1, product: PRODUCT_ID, size: '8x10' })
    await continueToOrder(shopper2)
    await confirmDesign(shopper2)
    await fillDetails(shopper2)
    await fillDelivery(shopper2)
    await expect(shopper2.getByTestId('pay-button')).toHaveText('Pay ₹849') // 700 + 149
    await pay(shopper2)
    await choosePaymentOutcome(shopper2, 'succeed')
    const secondOrderId = await expectConfirmation(shopper2)
    await expect(shopper2.getByTestId('confirm-total')).toHaveText('₹849')
    expect(secondOrderId).not.toBe(firstOrderId)

    // 7 — the FIRST order is exactly as it was — reopening its private link
    //     (a fresh context, no local state at all) still shows ₹649.
    const returning = await browser.newContext()
    const returningPage = await returning.newPage()
    await returningPage.goto(firstOrderLink)
    await expect(returningPage.getByTestId('confirmation')).toBeVisible({ timeout: 15_000 })
    await expect(returningPage.getByTestId('confirm-total')).toHaveText('₹649')

    // 8 — and the owner's own order records agree: old order unchanged, new
    //     order at the new price. Neither was touched by the other's price.
    await page.goto(`/admin/orders/${firstOrderId}`)
    await expect(page.getByTestId('order-detail-page')).toContainText('₹500')
    await expect(page.getByTestId('order-detail-page')).toContainText('₹649')
    await page.goto(`/admin/orders/${secondOrderId}`)
    await expect(page.getByTestId('order-detail-page')).toContainText('₹700')
    await expect(page.getByTestId('order-detail-page')).toContainText('₹849')

    await customer.close()
    await customer2.close()
    await returning.close()
  })
})
