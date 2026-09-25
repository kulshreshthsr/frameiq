import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { expect, type Page } from '@playwright/test'
import { addPhotos, chooseLayout, next, openApp, uploadWall } from './journey'

/** Helpers for driving the ordering flow the way a customer does. */

export const PACKAGES_DIR = './data/e2e/packages'
export const E2E_DB = 'file:./data/e2e/e2e.db'
export const SANDBOX_SECRET = 'e2e-sandbox-secret'

export const CUSTOMER = { name: 'Asha Rao', mobile: '98765 43210' }
export const ADDRESS = { line1: '12 MG Road, Indiranagar', line2: 'Near the metro', pin: '560038', city: 'Bengaluru', state: 'Karnataka' }

/** Two walnut 8 × 10 in frames: 2 × ₹499 + ₹149 delivery. */
export const TWO_FRAME_TOTAL = '₹1,147'

/**
 * Designs a small wall and ends on the preview step. Photos are large enough
 * (1600 × 1200) to print sharply at 8 × 10 in, which the server checks.
 */
export async function designWall(page: Page, opts: { layout?: string; photos?: number; size?: string; product?: string } = {}) {
  const { layout = 'two-horizontal', photos = 2, size = '8x10', product } = opts
  await openApp(page)
  await uploadWall(page, 'living-room')
  await next(page)
  await chooseLayout(page, layout)
  await next(page)
  await addPhotos(page, photos, [[1600, 1200]])
  await expect(page.getByText(new RegExp(`${photos} of ${photos} photos? added`))).toBeVisible()
  await next(page)
  if (product) await page.getByTestId(`product-${product}`).click()
  await next(page)
  await page.getByTestId(`size-${size}`).click()
  await expect(page.getByTestId(`size-${size}`)).toHaveAttribute('aria-checked', 'true')
  await next(page)
  await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible()
}

export async function continueToOrder(page: Page) {
  await page.getByTestId('primary-action').click()
  await expect(page.getByTestId('checkout')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Review your design' })).toBeVisible()
}

export async function confirmDesign(page: Page) {
  await expect(page.getByTestId('confirm-design')).toBeEnabled()
  await page.getByTestId('confirm-design').click()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
}

export async function fillDetails(page: Page, customer = CUSTOMER) {
  await page.getByTestId('field-name').fill(customer.name)
  await page.getByTestId('field-mobile').fill(customer.mobile)
  await page.getByTestId('details-continue').click()
  await expect(page.getByRole('heading', { name: 'Delivery' })).toBeVisible()
}

export async function fillDelivery(page: Page, address = ADDRESS) {
  await page.getByTestId('field-line1').fill(address.line1)
  await page.getByTestId('field-line2').fill(address.line2)
  await page.getByTestId('field-pin').fill(address.pin)
  await page.getByTestId('field-city').fill(address.city)
  await page.getByTestId('field-state').selectOption(address.state)
  await page.getByTestId('delivery-continue').click()
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible()
}

/** From the preview step to the payment screen, with valid details. */
export async function reachPayment(page: Page, opts: Parameters<typeof designWall>[1] = {}) {
  await designWall(page, opts)
  await continueToOrder(page)
  await confirmDesign(page)
  await fillDetails(page)
  await fillDelivery(page)
}

export async function pay(page: Page) {
  await page.getByTestId('pay-button').click()
}

export async function choosePaymentOutcome(page: Page, outcome: 'succeed' | 'fail' | 'cancel') {
  await expect(page.getByTestId(`sandbox-${outcome}`)).toBeVisible({ timeout: 45_000 })
  await page.getByTestId(`sandbox-${outcome}`).click()
}

export async function expectConfirmation(page: Page) {
  await expect(page.getByTestId('confirmation')).toBeVisible({ timeout: 30_000 })
  const id = (await page.getByTestId('order-id').innerText()).trim()
  expect(id).toMatch(/^FRM-\d{4}-\d{6}$/)
  return id
}

/** The private token from the confirmation page's URL. */
export function tokenFromUrl(page: Page): string {
  return new URL(page.url()).searchParams.get('t') ?? ''
}

export function packageFile(orderId: string, file: string): string | null {
  const path = `${PACKAGES_DIR}/${orderId}/${file}`
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** A webhook signed the way the sandbox gateway signs them. */
export function signedSandboxWebhook(event: Record<string, unknown>) {
  const body = JSON.stringify(event)
  return { body, signature: createHmac('sha256', SANDBOX_SECRET).update(body).digest('hex') }
}

/** Direct database access, for the one test that changes prices under a customer. */
export function db() {
  return createClient({ url: E2E_DB })
}
