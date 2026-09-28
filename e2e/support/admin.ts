import { expect, type Page } from '@playwright/test'

/** Credentials the e2e server bootstraps on first start — see
 * scripts/e2e-server.ts (OWNER_BOOTSTRAP_*). */
export const OWNER_EMAIL = 'owner@e2e.test'
export const OWNER_PASSWORD = 'e2e-owner-password'

export async function loginAsOwner(page: Page) {
  await page.goto('/admin/login')
  await page.getByTestId('login-email').fill(OWNER_EMAIL)
  await page.getByTestId('login-password').fill(OWNER_PASSWORD)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15_000 })
}

export async function createProduct(page: Page, input: { id: string; name: string; tagline: string; description: string; styleId: string }) {
  await page.goto('/admin/products/new')
  await page.getByTestId('field-id').fill(input.id)
  await page.getByTestId('field-name').fill(input.name)
  await page.getByLabel('Tagline').fill(input.tagline)
  await page.getByLabel('Description').fill(input.description)
  await page.getByLabel('Rendering style id').fill(input.styleId)
  await page.getByText('Standard').click() // the one glass option offered
  await page.getByText('No mat').click() // the one mat option offered
  await page.getByTestId('create-product-submit').click()
  await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 15_000 })
}

export async function addSize(page: Page, input: { id: string; displayLabel: string; width: number; height: number; priceRupees: number }) {
  await page.getByTestId('add-size-toggle').click()
  await page.getByTestId('size-id').fill(input.id)
  await page.getByLabel('Display label').fill(input.displayLabel)
  await page.getByLabel('Width (in, portrait)').fill(String(input.width))
  await page.getByLabel('Height (in, portrait)').fill(String(input.height))
  await page.getByTestId('size-price').fill(String(input.priceRupees))
  await page.getByTestId('add-size-submit').click()
  await expect(page.getByTestId(`size-row-${input.id}`)).toBeVisible()
}

export async function activateProduct(page: Page) {
  await page.getByTestId('toggle-active').click()
  await expect(page.getByTestId('toggle-active')).toHaveText('Deactivate')
}

export async function setSizePrice(page: Page, sizeId: string, priceRupees: number) {
  const input = page.getByTestId(`price-input-${sizeId}`)
  await input.fill(String(priceRupees))
  await page.getByTestId(`save-price-${sizeId}`).click()
  await expect(page.getByTestId(`save-price-${sizeId}`)).toHaveCount(0) // it disappears once saved (no longer "dirty")
}
