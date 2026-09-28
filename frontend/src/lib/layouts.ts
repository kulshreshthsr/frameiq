import type { LayoutDefinition, LayoutSlot } from '../types/frame'
import { DEFAULT_PRODUCT_ID } from '../domain/catalog'

interface GridOptions {
  frameWidthPct: number
  frameHeightPct: number
  gapXPct: number
  gapYPct: number
  centerXPct?: number
  centerYPct?: number
}

/** Places a rows×cols grid of equal-size frames, sized and spaced
 * explicitly (rather than derived from filling all available space) so
 * frames keep sane proportions regardless of grid shape. Reused by every
 * evenly-spaced layout below. */
function generateGridSlots(rows: number, cols: number, opts: GridOptions): LayoutSlot[] {
  const { frameWidthPct, frameHeightPct, gapXPct, gapYPct, centerXPct = 0.5, centerYPct = 0.5 } = opts
  const totalW = cols * frameWidthPct + (cols - 1) * gapXPct
  const totalH = rows * frameHeightPct + (rows - 1) * gapYPct
  const startX = centerXPct - totalW / 2 + frameWidthPct / 2
  const startY = centerYPct - totalH / 2 + frameHeightPct / 2

  const slots: LayoutSlot[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        id: `r${r}c${c}`,
        xPct: startX + c * (frameWidthPct + gapXPct),
        yPct: startY + r * (frameHeightPct + gapYPct),
        wPct: frameWidthPct,
        hPct: frameHeightPct,
      })
    }
  }
  return slots
}

export const LAYOUTS: LayoutDefinition[] = [
  {
    id: 'single-hero',
    name: 'Single Hero Frame',
    description: 'One large statement frame, centered on the wall.',
    allowedOrientation: 'any',
    defaultProductId: DEFAULT_PRODUCT_ID,
    spacing: 'normal',
    slots: [{ id: 'a', xPct: 0.5, yPct: 0.5, wPct: 0.36, hPct: 0.5 }],
  },
  {
    id: 'two-horizontal',
    name: 'Two Horizontal Frames',
    description: 'A pair of frames side by side.',
    allowedOrientation: 'landscape',
    defaultProductId: 'walnut',
    spacing: 'normal',
    slots: generateGridSlots(1, 2, { frameWidthPct: 0.24, frameHeightPct: 0.36, gapXPct: 0.06, gapYPct: 0 }),
  },
  {
    id: 'two-vertical',
    name: 'Two Vertical Frames',
    description: 'A pair of frames stacked top to bottom.',
    allowedOrientation: 'portrait',
    defaultProductId: 'walnut',
    spacing: 'normal',
    slots: generateGridSlots(2, 1, { frameWidthPct: 0.26, frameHeightPct: 0.24, gapXPct: 0, gapYPct: 0.06 }),
  },
  {
    id: 'three-minimal',
    name: 'Three Frame Minimal',
    description: 'Three equal frames in a clean, evenly spaced row.',
    allowedOrientation: 'landscape',
    defaultProductId: 'matte-black',
    spacing: 'tight',
    slots: generateGridSlots(1, 3, { frameWidthPct: 0.17, frameHeightPct: 0.26, gapXPct: 0.045, gapYPct: 0 }),
  },
  {
    id: 'three-classic',
    name: 'Three Frame Classic',
    description: 'A traditional triptych — larger center frame flanked by two smaller ones.',
    allowedOrientation: 'landscape',
    defaultProductId: 'natural-oak',
    spacing: 'normal',
    slots: [
      { id: 'center', xPct: 0.5, yPct: 0.5, wPct: 0.22, hPct: 0.34 },
      { id: 'left', xPct: 0.27, yPct: 0.5, wPct: 0.15, hPct: 0.26 },
      { id: 'right', xPct: 0.73, yPct: 0.5, wPct: 0.15, hPct: 0.26 },
    ],
  },
  {
    id: 'five-wedding',
    name: 'Five Frame Wedding',
    description: 'A romantic salon-style collage of five frames with gentle tilts.',
    allowedOrientation: 'any',
    defaultProductId: 'white',
    spacing: 'relaxed',
    slots: [
      { id: 'a', xPct: 0.5, yPct: 0.46, wPct: 0.24, hPct: 0.34 },
      { id: 'b', xPct: 0.24, yPct: 0.32, wPct: 0.15, hPct: 0.2, rotation: -4 },
      { id: 'c', xPct: 0.76, yPct: 0.32, wPct: 0.15, hPct: 0.2, rotation: 4 },
      { id: 'd', xPct: 0.22, yPct: 0.66, wPct: 0.13, hPct: 0.18, rotation: 3 },
      { id: 'e', xPct: 0.78, yPct: 0.66, wPct: 0.13, hPct: 0.18, rotation: -3 },
    ],
  },
  {
    id: 'six-family',
    name: 'Six Frame Family',
    description: 'A tidy 2×3 family wall grid.',
    allowedOrientation: 'any',
    defaultProductId: 'dark-brown',
    spacing: 'normal',
    slots: generateGridSlots(2, 3, { frameWidthPct: 0.17, frameHeightPct: 0.24, gapXPct: 0.035, gapYPct: 0.05 }),
  },
  {
    id: 'nine-grid',
    name: 'Nine Frame Grid',
    description: 'A dense, gallery-style 3×3 grid.',
    allowedOrientation: 'any',
    defaultProductId: 'matte-black',
    spacing: 'tight',
    slots: generateGridSlots(3, 3, { frameWidthPct: 0.14, frameHeightPct: 0.19, gapXPct: 0.025, gapYPct: 0.035 }),
  },
  {
    id: 'large-center-four-small',
    name: 'Large Center + Four Small',
    description: 'One hero frame with four smaller frames anchoring the corners.',
    allowedOrientation: 'any',
    defaultProductId: 'gold',
    spacing: 'relaxed',
    slots: [
      { id: 'center', xPct: 0.5, yPct: 0.5, wPct: 0.26, hPct: 0.38 },
      { id: 'top-left', xPct: 0.22, yPct: 0.22, wPct: 0.13, hPct: 0.17 },
      { id: 'top-right', xPct: 0.78, yPct: 0.22, wPct: 0.13, hPct: 0.17 },
      { id: 'bottom-left', xPct: 0.22, yPct: 0.78, wPct: 0.13, hPct: 0.17 },
      { id: 'bottom-right', xPct: 0.78, yPct: 0.78, wPct: 0.13, hPct: 0.17 },
    ],
  },
  {
    id: 'asymmetrical-gallery',
    name: 'Asymmetrical Gallery',
    description: 'An eclectic, irregular gallery-wall mix of sizes and angles.',
    allowedOrientation: 'any',
    defaultProductId: 'walnut',
    spacing: 'relaxed',
    slots: [
      { id: 'big', xPct: 0.34, yPct: 0.44, wPct: 0.22, hPct: 0.32, rotation: -2 },
      { id: 'medium', xPct: 0.6, yPct: 0.28, wPct: 0.15, hPct: 0.22, rotation: 3 },
      { id: 'small-1', xPct: 0.62, yPct: 0.6, wPct: 0.12, hPct: 0.16, rotation: -4 },
      { id: 'small-2', xPct: 0.8, yPct: 0.44, wPct: 0.1, hPct: 0.14, rotation: 2 },
      { id: 'tall', xPct: 0.2, yPct: 0.74, wPct: 0.11, hPct: 0.2, rotation: 4 },
    ],
    decorativeElements: [{ type: 'shelf', xPct: 0.5, yPct: 0.92, wPct: 0.7, hPct: 0.006, color: '#00000030' }],
  },
]

export const DEFAULT_LAYOUT_ID = LAYOUTS[0].id

export function getLayout(id: string): LayoutDefinition {
  return LAYOUTS.find((layout) => layout.id === id) ?? LAYOUTS[0]
}
