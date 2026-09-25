import { roundTo } from '../../shared/canonical'
import type { Crop } from '../../shared/orderSchema'
import type { PhotoTransform } from '../types/frame'

/**
 * Turns the customer's on-screen framing (zoom, pan, quarter-turn) into a
 * SCREEN-INDEPENDENT crop of the original photo: the rectangle of the
 * un-rotated image, as fractions 0–1, that shows through the frame's opening,
 * plus how far the photo is turned first.
 *
 * A manufacturer can apply this directly to the full-resolution original —
 * it means the same thing at any resolution, which is exactly what lets a
 * higher-resolution copy stand in for the editing copy.
 *
 * The photo is drawn centred on the opening, shifted by (offsetX, offsetY),
 * scaled by `scale` and rotated by `rotation` about its centre. To find what
 * the opening sees, its corners are carried back through that transform into
 * the photo's own coordinates.
 */

export interface PhotoDims {
  width: number
  height: number
}

/** The rotation the editor can produce is always a whole number of quarter
 * turns; anything else is snapped so the crop stays an exact rectangle. */
export function quarterTurns(rotationDeg: number): 0 | 90 | 180 | 270 {
  const snapped = ((Math.round(rotationDeg / 90) * 90) % 360 + 360) % 360
  return snapped as 0 | 90 | 180 | 270
}

export function computeCropRect(opening: { width: number; height: number }, photo: PhotoDims, transform: PhotoTransform): Crop {
  const rotationDeg = quarterTurns(transform.rotation)
  const theta = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      // Opening corner, relative to the photo's centre on screen…
      const px = (sx * opening.width) / 2 - transform.offsetX
      const py = (sy * opening.height) / 2 - transform.offsetY
      // …undo the rotation, then the scale, to land in the photo's own pixels.
      const qx = (px * cos + py * sin) / transform.scale
      const qy = (-px * sin + py * cos) / transform.scale
      minX = Math.min(minX, qx)
      maxX = Math.max(maxX, qx)
      minY = Math.min(minY, qy)
      maxY = Math.max(maxY, qy)
    }
  }

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const x0 = clamp01(0.5 + minX / photo.width)
  const x1 = clamp01(0.5 + maxX / photo.width)
  const y0 = clamp01(0.5 + minY / photo.height)
  const y1 = clamp01(0.5 + maxY / photo.height)

  return {
    x: roundTo(x0, 6),
    y: roundTo(y0, 6),
    width: roundTo(x1 - x0, 6),
    height: roundTo(y1 - y0, 6),
    rotationDeg,
  }
}
