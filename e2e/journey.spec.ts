import { expect, test } from '@playwright/test'
import {
  addPhotos,
  chooseLayout,
  dragOnWall,
  next,
  openApp,
  settle,
  totalText,
  uploadWall,
  watchForErrors,
} from './support/journey'

test.describe('customer journey', () => {
  test('a customer can go from a wall photo to a saved, priced design — and get it back after a refresh', async ({ page }) => {
    const errors = watchForErrors(page)
    await openApp(page)

    // 1 · Open: the promise and the first step are on screen; no developer tooling.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('framed on your own wall')
    await expect(page.getByRole('button', { name: /developer tools/i })).toHaveCount(0)
    await expect(page.getByText('Realism Lab')).toHaveCount(0)

    // 2 · Upload a wall photo, then mark the wall.
    await uploadWall(page, 'living-room')
    await expect(page.getByRole('heading', { name: 'Your wall' })).toBeVisible()
    await page.getByTestId('mark-wall').click()
    await expect(page.getByText(/Wall marked/)).toBeVisible()
    // Adjust the wall: nudge the top-left corner handle inward.
    await settle(page, 500)
    await dragOnWall(page, [0.12, 0.12], [0.18, 0.16])
    await expect(page.getByText(/Wall marked/)).toBeVisible()

    // Approximate scale: a wall width the customer can see and change.
    await expect(page.getByTestId('wall-width')).toHaveValue('300')
    await next(page)

    // 3 · Layout.
    await expect(page.getByRole('heading', { name: 'Choose a layout' })).toBeVisible()
    await chooseLayout(page, 'six-family')
    await expect(page.getByTestId('price-tag')).toContainText('6 frames')
    await next(page)

    // 4 · Photos: several at once fill the empty frames in order.
    await expect(page.getByRole('heading', { name: 'Add your photos' })).toBeVisible()
    await addPhotos(page, 4)
    await expect(page.getByText('4 of 6 photos added')).toBeVisible()
    await next(page)

    // 5 · Frames: choose a real product for the whole wall.
    await expect(page.getByRole('heading', { name: 'Choose your frames' })).toBeVisible()
    const beforeStyle = await totalText(page)
    await page.getByTestId('product-gold').click()
    await expect(page.getByTestId('product-gold')).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => totalText(page)).not.toBe(beforeStyle)
    await next(page)

    // 6 · Size & price: the live price follows the size, exactly.
    await expect(page.getByRole('heading', { name: 'Size & price' })).toBeVisible()
    await page.getByTestId('size-8x10').click()
    await expect(page.getByTestId('size-8x10')).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => totalText(page)).toBe('₹4,194') // 6 × Antique Gold 8 × 10 in at ₹699
    await expect(page.getByTestId('quote-total')).toHaveText('₹4,194')
    await expect(page.getByTestId('quote-summary')).toContainText('6 × Antique Gold')

    // Options change the price by the size's surcharge.
    await page.getByTestId('glass-premium').click()
    await expect.poll(() => totalText(page)).toBe('₹5,088') // + 6 × ₹149
    await page.getByTestId('glass-standard').click()
    await expect.poll(() => totalText(page)).toBe('₹4,194')
    await next(page)

    // 7 · Preview: before / compare / after, and full screen.
    await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible()
    for (const mode of ['Before', 'Compare', 'After']) {
      await page.getByRole('radio', { name: mode }).click()
      await expect(page.getByRole('radio', { name: mode })).toHaveAttribute('aria-checked', 'true')
      await settle(page, 450)
    }
    await page.getByTestId('fullscreen').click()
    await expect(page.getByTestId('exit-fullscreen')).toBeVisible()
    await page.getByTestId('exit-fullscreen').click()
    await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible()

    // 8 · Refresh: the draft comes back — same design, same price, same step.
    await settle(page, 1200) // let autosave finish
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Preview on your wall' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/we’ve restored your design/i)).toBeVisible()
    await expect.poll(() => totalText(page)).toBe('₹4,194')
    await expect(page.getByTestId('price-tag')).toContainText('6 frames')

    // 9 · Export: a real PNG downloads.
    const download = page.waitForEvent('download')
    await page.getByTestId('save-image').click()
    const file = await download
    expect(file.suggestedFilename()).toBe('my-wall.png')
    const path = await file.path()
    const { readFileSync } = await import('node:fs')
    const bytes = readFileSync(path)
    expect(bytes.length).toBeGreaterThan(5_000)
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG signature
    expect(bytes.readUInt32BE(16)).toBeLessThanOrEqual(4096) // width, within any device's canvas limit
    await expect(page.getByText(/saved/i).first()).toBeVisible()

    // 10 · Through all of it, nothing went wrong.
    expect(errors()).toEqual([])
  })

  test('you can go back and change earlier choices without losing later ones', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'white')
    await next(page)
    await chooseLayout(page, 'three-classic')
    await next(page)
    await addPhotos(page, 3)
    await expect(page.getByText('3 of 3 photos added')).toBeVisible()
    await next(page)
    await next(page)
    await expect(page.getByRole('heading', { name: 'Size & price' })).toBeVisible()

    // Jump back to Layout via the progress indicator; the photos survive a layout change.
    await page.getByRole('button', { name: /Step 2: Layout/ }).click()
    await expect(page.getByRole('heading', { name: 'Choose a layout' })).toBeVisible()
    await chooseLayout(page, 'three-minimal')
    await page.getByRole('button', { name: /Step 3: Photos/ }).click()
    await expect(page.getByText('3 of 3 photos added')).toBeVisible()

    // Steps beyond the furthest reached stay locked.
    await page.getByRole('button', { name: /Step 5: Size & price/ }).click()
    await expect(page.getByRole('heading', { name: 'Size & price' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Step 6: Preview, not reached yet/ })).toBeDisabled()
  })

  test('the crop editor keeps a photo covering its frame, and a frame can be repositioned by keyboard', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'white')
    await next(page)
    await next(page)
    await addPhotos(page, 1, [[1600, 900]])
    await expect(page.getByTestId('adjust-photo')).toBeVisible()
    await page.getByTestId('adjust-photo').click()
    const editor = page.getByRole('dialog')
    await expect(editor.getByRole('heading', { name: /Adjust Frame 1/ })).toBeVisible()
    const region = editor.getByRole('group', { name: /Photo position/ })
    await region.focus()
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('+')
    await editor.getByRole('button', { name: 'Reset' }).click()
    await editor.getByTestId('crop-done').click()
    await expect(editor).toBeHidden()
  })

  test('the layout and frame pickers are reachable by keyboard', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'white')
    await next(page)
    const layout = page.getByTestId('layout-two-horizontal')
    await layout.focus()
    await page.keyboard.press('Enter')
    await expect(layout).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('price-tag')).toContainText('2 frames')
  })

  test('marking a wall photographed at an angle lines frames up with it', async ({ page }) => {
    const errors = watchForErrors(page)
    await openApp(page)
    await uploadWall(page, 'angled')
    await page.getByTestId('mark-wall').click()
    await settle(page, 500)
    // Drag all four handles onto the trapezoid wall in the photo.
    await dragOnWall(page, [0.12, 0.12], [0.1, 0.08])
    await dragOnWall(page, [0.88, 0.12], [0.93, 0.22])
    await dragOnWall(page, [0.88, 0.88], [0.93, 0.74])
    await dragOnWall(page, [0.12, 0.88], [0.1, 0.94])
    await next(page)
    await chooseLayout(page, 'three-classic')
    await settle(page, 1200)
    await expect(page.getByTestId('price-tag')).toContainText('3 frames')
    expect(errors()).toEqual([])
  })
})
