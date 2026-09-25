/**
 * Reads what an uploaded file really is — type and pixel size — from its own
 * bytes, without trusting the filename or the Content-Type the client sent.
 * Supports exactly the formats the app accepts: JPEG, PNG, WebP.
 *
 * Pixel size matters: it decides whether a photo is sharp enough to print.
 * For JPEGs the size is the size AS DISPLAYED — the EXIF orientation flag is
 * applied (a phone photo stored sideways reports swapped dimensions), which
 * is how the browser measured the very same photo when the design was made.
 */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ImageInfo {
  mime: ImageMime
  width: number
  height: number
}

export const EXTENSION_FOR: Record<ImageMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function inspectImage(bytes: Buffer): ImageInfo | null {
  try {
    return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes)
  } catch {
    // A truncated or malformed file is simply "not a usable image".
    return null
  }
}

function positive(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 65535 * 2 && height <= 65535 * 2
}

// ------------------------------------------------------------------ PNG

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function readPng(b: Buffer): ImageInfo | null {
  if (b.length < 24 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null
  const width = b.readUInt32BE(16)
  const height = b.readUInt32BE(20)
  return positive(width, height) ? { mime: 'image/png', width, height } : null
}

// ------------------------------------------------------------------ JPEG

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function readJpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let offset = 2
  let orientation = 1
  let size: { width: number; height: number } | null = null

  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = b[offset + 1]
    if (marker === 0xff) {
      offset += 1 // fill byte
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2 // markers with no length
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break // end of image / start of scan
    const length = b.readUInt16BE(offset + 2)
    if (length < 2) return null
    const body = offset + 4

    if (marker === 0xe1 && b.toString('ascii', body, body + 6) === 'Exif\0\0') {
      orientation = readExifOrientation(b, body + 6, offset + 2 + length) ?? orientation
    }
    if (SOF_MARKERS.has(marker)) {
      size = { height: b.readUInt16BE(body + 1), width: b.readUInt16BE(body + 3) }
    }
    offset += 2 + length
  }

  if (!size) return null
  // Orientations 5–8 are the quarter-turned ones: the displayed image swaps sides.
  const swapped = orientation >= 5 && orientation <= 8
  const width = swapped ? size.height : size.width
  const height = swapped ? size.width : size.height
  return positive(width, height) ? { mime: 'image/jpeg', width, height } : null
}

function readExifOrientation(b: Buffer, tiff: number, end: number): number | null {
  if (tiff + 8 > end) return null
  const little = b.toString('ascii', tiff, tiff + 2) === 'II'
  if (!little && b.toString('ascii', tiff, tiff + 2) !== 'MM') return null
  const u16 = (o: number) => (little ? b.readUInt16LE(o) : b.readUInt16BE(o))
  const u32 = (o: number) => (little ? b.readUInt32LE(o) : b.readUInt32BE(o))
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return null
  const entries = u16(ifd)
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return null
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

// ------------------------------------------------------------------ WebP

function readWebp(b: Buffer): ImageInfo | null {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null
  const kind = b.toString('ascii', 12, 16)
  let width: number
  let height: number
  if (kind === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    width = b.readUInt16LE(26) & 0x3fff
    height = b.readUInt16LE(28) & 0x3fff
  } else if (kind === 'VP8L') {
    if (b[20] !== 0x2f) return null
    const bits = b.readUInt32LE(21)
    width = (bits & 0x3fff) + 1
    height = ((bits >>> 14) & 0x3fff) + 1
  } else if (kind === 'VP8X') {
    width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
    height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
  } else {
    return null
  }
  return positive(width, height) ? { mime: 'image/webp', width, height } : null
}
