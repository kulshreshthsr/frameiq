import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { addPhotos, next, openApp, settle, uploadWall, watchForErrors } from './support/journey'
import { photoImage, upload, wallImage } from './support/images'

const DRAFT_KEY = 'framengine.draft'

test.describe('edge and error states', () => {
  test('a file that is not a photo gets a calm explanation, and the page stays usable', async ({ page }) => {
    const errors = watchForErrors(page)
    await openApp(page)
    await page.getByTestId('wall-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    const alert = page.getByRole('alert')
    await expect(alert).toContainText("isn't supported")
    await expect(alert).not.toContainText(/error|undefined|exception|TypeError/i)
    // Recovery: a real photo still works straight after.
    await uploadWall(page, 'white')
    expect(errors()).toEqual([])
  })

  test('a photo that is really corrupt says so plainly', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('wall-input').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png') })
    await expect(page.getByRole('alert')).toContainText(/couldn't open that photo/i)
  })

  test('an empty file is rejected with guidance', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('wall-input').setInputFiles({ name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) })
    await expect(page.getByRole('alert')).toContainText(/empty/i)
  })

  test('a bad photo among good ones does not stop the rest, and says how many failed', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'white')
    await next(page)
    await page.getByTestId('layout-two-horizontal').click()
    await next(page)
    await page.getByTestId('photo-input').setInputFiles([
      upload('good-1.png', photoImage(800, 600)),
      { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('nope') },
    ])
    await expect(page.getByRole('alert')).toContainText(/couldn't open that photo/i)
    await expect(page.getByText('1 of 2 photos added')).toBeVisible()
  })

  test('a corrupted saved draft is discarded with a notice instead of breaking startup', async ({ page }) => {
    const errors = watchForErrors(page)
    await page.addInitScript((key) => localStorage.setItem(key, '{"version":1,"wall":'), DRAFT_KEY)
    await page.goto('/')
    await expect(page.getByTestId('wall-input')).toBeAttached()
    await expect(page.getByText(/couldn't restore your last design/i)).toBeVisible()
    expect(errors()).toEqual([])
  })

  test('a saved draft whose images are gone falls back gracefully', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'white')
    await settle(page, 1200)
    // Wipe the image database but leave the draft JSON — as if storage were partly cleared.
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      await Promise.all(dbs.map((d) => new Promise<void>((resolve) => { const r = indexedDB.deleteDatabase(d.name!); r.onsuccess = r.onerror = r.onblocked = () => resolve() })))
    })
    await page.reload()
    await expect(page.getByTestId('wall-input')).toBeAttached({ timeout: 20_000 })
    await expect(page.getByText(/couldn't restore your last design/i)).toBeVisible()
  })

  test('start over asks first, then clears the design and the saved draft', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'white')
    await settle(page, 1200)
    expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY)).not.toBeNull()

    await page.getByRole('button', { name: /^(Start over|Start a new design)$/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Start a new design?')
    // Cancel keeps everything.
    await dialog.getByRole('button', { name: 'Keep designing' }).click()
    await expect(page.getByTestId('wall-width')).toBeVisible()
    // Confirm clears it.
    await page.getByRole('button', { name: /^(Start over|Start a new design)$/ }).click()
    await page.getByTestId('confirm-start-over').click()
    await expect(page.getByTestId('wall-input')).toBeAttached()
    expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY)).toBeNull()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/restored/i)).toHaveCount(0)
  })

  test('the wall width rejects nonsense and says why', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'white')
    const field = page.getByTestId('wall-width')
    await field.fill('-20')
    await expect(page.getByRole('alert').filter({ hasText: /between/ })).toBeVisible()
    await expect(page.getByTestId('primary-action')).toBeDisabled()
    await field.fill('450')
    await field.press('Enter')
    await expect(page.getByTestId('primary-action')).toBeEnabled()
    await expect(page.getByText(/14 ft 9 in/)).toBeVisible()
  })

  test('a very large wall photo is downsized for editing and still exports safely', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'heavy fixture; one project is enough')
    test.setTimeout(120_000)
    const errors = watchForErrors(page)
    await openApp(page)
    await page.getByTestId('wall-input').setInputFiles(upload('huge.png', wallImage('brick', 5600, 4200)))
    await expect(page.getByTestId('wall-width')).toBeVisible({ timeout: 60_000 })
    await next(page)
    await next(page)
    await addPhotos(page, 1)
    await expect(page.getByText('1 of 1 photo added')).toBeVisible({ timeout: 30_000 })
    for (let i = 0; i < 3; i++) await next(page)
    const download = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByTestId('save-image').click()
    const bytes = readFileSync((await (await download).path())!)
    expect(bytes.readUInt32BE(16)).toBeLessThanOrEqual(4096)
    expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(4096)
    expect(errors()).toEqual([])
  })
})

test.describe('phone ergonomics', () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone-only checks')
  })

  test('nothing overflows the screen sideways at any step', async ({ page }) => {
    await openApp(page)
    const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(await overflows()).toBe(false)
    await uploadWall(page, 'living-room')
    for (let step = 1; step <= 6; step++) {
      expect(await overflows(), `step ${step}`).toBe(false)
      if (step === 3) await addPhotos(page, 2)
      if (step < 6) await next(page)
    }
  })

  test('every button and option is a comfortable touch target', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'living-room')
    for (let step = 1; step <= 6; step++) {
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, [role=radio], input[type=range]')]
          .filter((el) => el.offsetParent !== null && !el.closest('dialog:not([open])'))
          .map((el) => ({ label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && Math.min(r.width, r.height) < 40)
          .map(({ label, r }) => `${label} (${Math.round(r.width)}×${Math.round(r.height)})`),
      )
      // Inline text links (e.g. "Add photos" inside a sentence) are exempt from the
      // 40px floor by convention; everything else must clear it.
      const offenders = small.filter((s) => !/^(Add photos|Change wall width|Use a different photo|Use the whole photo|‹)/.test(s))
      expect(offenders, `step ${step}`).toEqual([])
      if (step === 3) await addPhotos(page, 2)
      if (step < 6) await next(page)
    }
  })

  test('the primary action stays on screen while a long panel scrolls', async ({ page }) => {
    await openApp(page)
    await uploadWall(page, 'living-room')
    for (let i = 0; i < 4; i++) await next(page) // to Frames
    const button = page.getByTestId('primary-action')
    const box = (await button.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    expect(box.y).toBeGreaterThan(viewport.height * 0.7)
  })
})
