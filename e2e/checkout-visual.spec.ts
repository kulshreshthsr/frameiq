import { expect, test } from '@playwright/test'
import { choosePaymentOutcome, confirmDesign, continueToOrder, designWall, expectConfirmation, fillDelivery, fillDetails, pay } from './support/checkout'
import { settle } from './support/journey'

/**
 * Baselines for the ordering screens, on every device size, as the customer
 * first sees each one (scrolled to the top). Anything that changes between
 * runs — the order number, the WhatsApp link — is masked.
 */
test('the ordering screens look right', async ({ page }) => {
  await designWall(page)
  await continueToOrder(page)
  const shot = async (name: string, mask: ReturnType<typeof page.locator>[] = []) => {
    await settle(page, 500)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page).toHaveScreenshot(name, { mask, maxDiffPixelRatio: 0.03 })
  }

  await shot('review.png')
  await confirmDesign(page)
  await shot('details.png')
  await fillDetails(page)
  await shot('delivery.png')
  await fillDelivery(page)
  await shot('payment.png')

  await pay(page)
  await choosePaymentOutcome(page, 'succeed')
  await expectConfirmation(page)
  await shot('confirmation.png', [page.getByTestId('order-id'), page.getByTestId('whatsapp')])
})
