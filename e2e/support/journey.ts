import { expect, type Locator, type Page } from '@playwright/test'
import { photoImage, upload, wallImage, type WallKind } from './images'

/** Captures anything that would show up as a red error in a customer's console. */
export function watchForErrors(page: Page): () => string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return () => errors
}

export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('wall-input')).toBeAttached()
}

export async function uploadWall(page: Page, kind: WallKind = 'living-room', width = 1200, height = 900) {
  await page.getByTestId('wall-input').setInputFiles(upload(`${kind}.png`, wallImage(kind, width, height)))
  await expect(page.getByTestId('wall-width')).toBeVisible()
}

export async function next(page: Page) {
  await page.getByTestId('primary-action').click()
}

export async function chooseLayout(page: Page, id: string) {
  await page.getByTestId(`layout-${id}`).click()
}

const HUES = [0, 40, -30, 60, 20, -50]

export async function addPhotos(page: Page, count: number, sizes: [number, number][] = [[1200, 900], [900, 1200], [1000, 1000]]) {
  const files = Array.from({ length: count }, (_, i) => {
    const [w, h] = sizes[i % sizes.length]
    return upload(`photo-${i}.png`, photoImage(w, h, HUES[i % HUES.length]))
  })
  await page.getByTestId('photo-input').setInputFiles(files)
}

/** The canvas area the wall photo is drawn in. */
export function canvasArea(page: Page): Locator {
  return page.getByRole('img', { name: /Your wall/ })
}

/**
 * Where a point on the wall photo ends up on screen. The photo is fitted
 * inside the canvas with 16px padding and centred (see lib/canvasFit.ts), so
 * tests can aim at an exact spot on the photo — such as a wall-corner handle.
 */
export async function wallPointToScreen(page: Page, fx: number, fy: number, imageSize = { width: 1200, height: 900 }) {
  const box = (await canvasArea(page).boundingBox())!
  const pad = 16
  const scale = Math.min((box.width - pad * 2) / imageSize.width, (box.height - pad * 2) / imageSize.height)
  const drawnW = imageSize.width * scale
  const drawnH = imageSize.height * scale
  return {
    x: box.x + (box.width - drawnW) / 2 + fx * drawnW,
    y: box.y + (box.height - drawnH) / 2 + fy * drawnH,
  }
}

export async function dragOnWall(page: Page, from: [number, number], to: [number, number]) {
  const start = await wallPointToScreen(page, ...from)
  const end = await wallPointToScreen(page, ...to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 })
  await page.mouse.move(end.x, end.y, { steps: 4 })
  await page.mouse.up()
}

/** Gives the canvas a moment to finish async work (image decode, perspective snapshots). */
export async function settle(page: Page, ms = 900) {
  await page.waitForTimeout(ms)
}

export async function totalText(page: Page): Promise<string> {
  return (await page.getByTestId('price-total').innerText()).trim()
}
