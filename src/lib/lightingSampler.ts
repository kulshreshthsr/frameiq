import { clamp } from './geometry'

export interface LumaMap {
  width: number
  height: number
  /** Row-major luma (perceptual brightness), one value per cell, each in [0,1]. */
  data: Float32Array
}

const DEFAULT_MAX_EDGE = 64
const FALLBACK_MAP: LumaMap = { width: 1, height: 1, data: new Float32Array([0.5]) }

/**
 * Downsamples an image to a small luma (brightness) map — a handful of
 * pixels on the long edge is plenty for "does this wall read bright or
 * dim", and keeps this a one-time-per-wall-photo cost rather than a
 * per-frame one. All image sources in this app are blob:/data: URLs
 * (uploads and procedurally-generated test images), so this never hits a
 * cross-origin tainted-canvas error.
 */
export function buildLumaMap(image: CanvasImageSource, maxEdge = DEFAULT_MAX_EDGE): LumaMap {
  const srcWidth = 'naturalWidth' in image ? image.naturalWidth || (image as { width: number }).width : (image as { width: number }).width
  const srcHeight = 'naturalHeight' in image ? image.naturalHeight || (image as { height: number }).height : (image as { height: number }).height
  if (!srcWidth || !srcHeight) return FALLBACK_MAP

  const scale = maxEdge / Math.max(srcWidth, srcHeight)
  const width = Math.max(1, Math.round(srcWidth * scale))
  const height = Math.max(1, Math.round(srcHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return FALLBACK_MAP
  ctx.drawImage(image, 0, 0, width, height)

  let pixels: Uint8ClampedArray
  try {
    pixels = ctx.getImageData(0, 0, width, height).data
  } catch {
    return FALLBACK_MAP
  }

  const data = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4]
    const g = pixels[i * 4 + 1]
    const b = pixels[i * 4 + 2]
    data[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return { width, height, data }
}

export interface UnitBBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Average luma within a padded region of the map, in normalized [0,1]
 * unit-space (a fraction of the source image's own width/height). Padding
 * widens the sample past the region itself so it reads the *surrounding*
 * wall, not just the area a frame already covers. */
export function sampleRegionLuma(map: LumaMap, bbox: UnitBBox, paddingRatio = 0.5): number {
  const bw = bbox.x1 - bbox.x0
  const bh = bbox.y1 - bbox.y0
  const px = bw * paddingRatio
  const py = bh * paddingRatio
  const x0 = clamp(bbox.x0 - px, 0, 1)
  const x1 = clamp(bbox.x1 + px, 0, 1)
  const y0 = clamp(bbox.y0 - py, 0, 1)
  const y1 = clamp(bbox.y1 + py, 0, 1)

  const cx0 = Math.floor(x0 * map.width)
  const cx1 = Math.max(cx0 + 1, Math.ceil(x1 * map.width))
  const cy0 = Math.floor(y0 * map.height)
  const cy1 = Math.max(cy0 + 1, Math.ceil(y1 * map.height))

  let sum = 0
  let count = 0
  for (let y = Math.max(0, cy0); y < Math.min(cy1, map.height); y++) {
    for (let x = Math.max(0, cx0); x < Math.min(cx1, map.width); x++) {
      sum += map.data[y * map.width + x]
      count++
    }
  }
  return count > 0 ? sum / count : 0.5
}

/**
 * Maps a sampled luma to a bounded lighting-response factor around a
 * neutral baseline. This is a deliberately gentle nudge for shadow/glass/
 * bevel intensity, not a relight — the response consuming this factor
 * further dampens it, so the range here can be a little generous.
 */
export function lumaToLightingFactor(luma: number, baseline = 0.5, sensitivity = 0.9): number {
  return clamp(1 + (luma - baseline) * sensitivity, 0.65, 1.35)
}
