import { expect, test, type Page } from '@playwright/test'
import {
  ADDRESS,
  TWO_FRAME_TOTAL,
  choosePaymentOutcome,
  confirmDesign,
  continueToOrder,
  designWall,
  expectConfirmation,
  fillDelivery,
  fillDetails,
  pay,
} from './support/checkout'

const PHONES = [
  { name: 'iPhone 14 (390×844)', width: 390, height: 844 },
  { name: 'iPhone X (375×812)', width: 375, height: 812 },
  { name: 'iPhone Pro Max (430×932)', width: 430, height: 932 },
]

/** Nothing may push the page wider than the screen. */
async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(0)
}

/** Every visible control in the checkout is large enough to hit and to read on a phone. */
async function expectTouchFriendly(page: Page, where: string) {
  const problems = await page.evaluate(() => {
    const found: string[] = []
    const root = document.querySelector('[data-testid=checkout]')!
    for (const el of root.querySelectorAll<HTMLElement>('button, input, select, a[href]')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue // hidden
      const label = el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 24) ?? el.tagName
      if (el.matches('input, select') && parseFloat(getComputedStyle(el).fontSize) < 16) found.push(`${label}: font ${getComputedStyle(el).fontSize} (iOS would zoom the page)`)
      const isInlineText = el.matches('.btnText, a')
      if (!isInlineText && box.height < 44) found.push(`${label}: only ${Math.round(box.height)}px tall`)
    }
    return found
  })
  expect(problems, `touch problems on ${where}`).toEqual([])
}

test.describe('checkout on a phone', () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone sizes only')
  })

  for (const phone of PHONES) {
    test(`${phone.name}: every stage fits, is reachable with a thumb, and pays`, async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height })
      await designWall(page)
      await continueToOrder(page)

      await expectNoHorizontalScroll(page, 'review')
      await expectTouchFriendly(page, 'review')
      // The way forward stays on screen while reading a long review.
      const confirm = page.getByTestId('confirm-design')
      await expect(confirm).toBeInViewport({ ratio: 1 })
      await confirmDesign(page)

      await expectNoHorizontalScroll(page, 'details')
      await expectTouchFriendly(page, 'details')
      await expect(page.getByTestId('field-mobile')).toHaveAttribute('inputmode', 'tel')
      await expect(page.getByTestId('field-mobile')).toHaveAttribute('autocomplete', 'tel-national')
      await expect(page.getByTestId('field-name')).toHaveAttribute('autocomplete', 'name')
      await fillDetails(page)

      await expectNoHorizontalScroll(page, 'delivery')
      await expectTouchFriendly(page, 'delivery')
      await expect(page.getByTestId('field-pin')).toHaveAttribute('inputmode', 'numeric')
      await expect(page.getByTestId('delivery-continue')).toBeInViewport({ ratio: 1 })
      await fillDelivery(page, ADDRESS)

      await expectNoHorizontalScroll(page, 'payment')
      await expectTouchFriendly(page, 'payment')
      await expect(page.getByTestId('pay-button')).toBeInViewport({ ratio: 1 })
      await expect(page.getByTestId('pay-button')).toHaveText(`Pay ${TWO_FRAME_TOTAL}`)
      await pay(page)
      await choosePaymentOutcome(page, 'succeed')

      await expectConfirmation(page)
      await expectNoHorizontalScroll(page, 'confirmation')
      await expectTouchFriendly(page, 'confirmation')
    })
  }
})
