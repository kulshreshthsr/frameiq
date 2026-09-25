import { expect, test } from '@playwright/test'
import { addPhotos, canvasArea, chooseLayout, dragOnWall, next, openApp, settle, uploadWall } from './support/journey'
import type { WallKind } from './support/images'

/**
 * Screenshot baselines of the framed wall on a controlled set of rooms —
 * bright, dark, textured, furnished, dim, and one photographed at an angle —
 * so a change that breaks how frames sit on a wall shows up as a diff.
 * Images are generated deterministically (see support/images.ts).
 *
 * Update intentionally with: npx playwright test e2e/visual.spec.ts --update-snapshots
 */
const WALLS: WallKind[] = ['white', 'dark', 'brick', 'living-room', 'low-light', 'angled']

test.describe('framed wall baselines', () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(info.project.name === 'tablet', 'baselines are kept for phone and desktop')
  })

  for (const kind of WALLS) {
    test(`${kind} wall`, async ({ page }) => {
      await openApp(page)
      await uploadWall(page, kind)

      if (kind === 'angled') {
        await page.getByTestId('mark-wall').click()
        await settle(page, 500)
        await dragOnWall(page, [0.12, 0.12], [0.1, 0.08])
        await dragOnWall(page, [0.88, 0.12], [0.93, 0.22])
        await dragOnWall(page, [0.88, 0.88], [0.93, 0.74])
        await dragOnWall(page, [0.12, 0.88], [0.1, 0.94])
      }

      await next(page)
      await chooseLayout(page, 'three-classic')
      await next(page)
      await addPhotos(page, 3)
      await expect(page.getByText('3 of 3 photos added')).toBeVisible()
      await next(page)
      await page.getByTestId('product-walnut').click()
      await next(page)
      await next(page)
      await settle(page, 1500)

      await expect(canvasArea(page)).toHaveScreenshot(`${kind}.png`)
    })
  }

  test('before and after are visibly different states of the same room', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'living-room')
    await next(page)
    await chooseLayout(page, 'three-classic')
    await next(page)
    await addPhotos(page, 3)
    await next(page)
    await next(page)
    await next(page)
    await settle(page, 1200)

    const after = await canvasArea(page).screenshot()
    await page.getByRole('radio', { name: 'Before' }).click()
    await settle(page, 900)
    const before = await canvasArea(page).screenshot()
    expect(Buffer.compare(after, before)).not.toBe(0)
    await expect(canvasArea(page)).toHaveScreenshot('before-state.png')
  })
})
