import { deflateSync } from 'node:zlib'

/**
 * Deterministic test images, generated in pure Node (no canvas, no binary
 * assets in the repo). Everything is seeded, so screenshot baselines are
 * reproducible: the same call always produces the same bytes.
 */

type RGB = [number, number, number]

class Raster {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height * 4)
  }

  setPixel(x: number, y: number, [r, g, b]: RGB, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = (y * this.width + x) * 4
    if (alpha >= 1) {
      this.data[i] = r
      this.data[i + 1] = g
      this.data[i + 2] = b
    } else {
      this.data[i] = this.data[i] * (1 - alpha) + r * alpha
      this.data[i + 1] = this.data[i + 1] * (1 - alpha) + g * alpha
      this.data[i + 2] = this.data[i + 2] * (1 - alpha) + b * alpha
    }
    this.data[i + 3] = 255
  }

  rect(x: number, y: number, w: number, h: number, color: RGB, alpha = 1) {
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.height, Math.ceil(y + h)); j++) {
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.width, Math.ceil(x + w)); i++) this.setPixel(i, j, color, alpha)
    }
  }

  /** Vertical gradient fill of the whole raster (or a horizontal band of it). */
  verticalGradient(top: RGB, bottom: RGB, y0 = 0, y1 = this.height) {
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0 - 1)
      const color: RGB = [lerp(top[0], bottom[0], t), lerp(top[1], bottom[1], t), lerp(top[2], bottom[2], t)]
      for (let x = 0; x < this.width; x++) this.setPixel(x, y, color)
    }
  }

  /** Scanline polygon fill; `shade` may return a colour per pixel. */
  polygon(points: [number, number][], shade: (x: number, y: number) => RGB) {
    const ys = points.map((p) => p[1])
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(this.height - 1, Math.ceil(Math.max(...ys))); y++) {
      const xs: number[] = []
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]
        const [x2, y2] = points[(i + 1) % points.length]
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.setPixel(x, y, shade(x, y))
      }
    }
  }
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// ---------------------------------------------------------------- PNG encode

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + body.length)
  out.writeUInt32BE(body.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(body).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length)
  return out
}

function encodePng(r: Raster): Buffer {
  const stride = r.width * 4
  const raw = Buffer.alloc((stride + 1) * r.height)
  for (let y = 0; y < r.height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(r.data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(r.width, 0)
  ihdr.writeUInt32BE(r.height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------- walls

function paintedWall(r: Raster, top: RGB, bottom: RGB, seed = 11) {
  r.verticalGradient(top, bottom)
  const rand = seeded(seed)
  for (let i = 0; i < r.width * r.height * 0.004; i++) {
    r.setPixel(Math.floor(rand() * r.width), Math.floor(rand() * r.height), rand() > 0.5 ? [0, 0, 0] : [255, 255, 255], 0.05)
  }
}

export type WallKind = 'white' | 'dark' | 'brick' | 'living-room' | 'low-light' | 'angled'

/** A room photo. All are landscape 4:3 unless a size is given. */
export function wallImage(kind: WallKind, width = 1200, height = 900): Buffer {
  const r = new Raster(width, height)
  switch (kind) {
    case 'white':
      paintedWall(r, [246, 244, 239], [226, 223, 216])
      break
    case 'dark':
      paintedWall(r, [58, 58, 64], [34, 34, 38])
      break
    case 'low-light': {
      // Warm lamp-lit room with a soft falloff toward the corners.
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const d = Math.hypot((x - width * 0.5) / width, (y - height * 0.4) / height)
          const t = Math.min(1, d * 1.6)
          r.setPixel(x, y, [lerp(88, 22, t), lerp(66, 20, t), lerp(46, 26, t)])
        }
      }
      break
    }
    case 'brick': {
      r.rect(0, 0, width, height, [201, 194, 184])
      const rand = seeded(7)
      const bh = height / 14
      const bw = bh * 2.1
      const gap = Math.max(1, bh * 0.08)
      for (let row = 0, y = 0; y < height; y += bh, row++) {
        for (let x = row % 2 === 0 ? 0 : -bw / 2; x < width; x += bw) {
          const j = (rand() - 0.5) * 30
          r.rect(x + gap / 2, y + gap / 2, bw - gap, bh - gap, [clamp8(158 + j), clamp8(82 + j * 0.6), clamp8(62 + j * 0.5)])
        }
      }
      break
    }
    case 'living-room': {
      const wallBottom = height * 0.74
      r.verticalGradient([222, 212, 196], [204, 194, 178], 0, wallBottom)
      r.rect(0, wallBottom, width, height * 0.04, [236, 231, 221])
      r.verticalGradient([94, 70, 52], [58, 42, 30], Math.floor(height * 0.78), height)
      r.rect(width * 0.04, wallBottom - height * 0.15, width * 0.26, height * 0.15, [58, 68, 82])
      r.rect(width * 0.04 - 6, wallBottom - height * 0.195, width * 0.26 + 12, height * 0.05, [50, 58, 72])
      r.rect(width * 0.86, wallBottom - height * 0.02, width * 0.06, height * 0.05, [62, 46, 40])
      break
    }
    case 'angled': {
      // A brick wall seen from the left: the right edge is farther away, so
      // the wall is a trapezoid narrowing to the right, against a plain room.
      r.verticalGradient([200, 196, 188], [166, 160, 150])
      const quad: [number, number][] = [
        [width * 0.1, height * 0.08],
        [width * 0.93, height * 0.22],
        [width * 0.93, height * 0.74],
        [width * 0.1, height * 0.94],
      ]
      const rand = seeded(19)
      r.polygon(quad, (x, y) => {
        const u = (x - quad[0][0]) / (quad[1][0] - quad[0][0])
        const brick = (Math.floor(x / (28 - 12 * u)) + Math.floor(y / (14 - 5 * u))) % 2 === 0
        const shade = 1 - u * 0.25
        const j = (rand() - 0.5) * 8
        const base: RGB = brick ? [176, 108, 86] : [160, 92, 72]
        return [clamp8(base[0] * shade + j), clamp8(base[1] * shade + j), clamp8(base[2] * shade + j)]
      })
      break
    }
  }
  return encodePng(r)
}

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

// ---------------------------------------------------------------- photos

/** A photograph-ish placeholder: sky, sun and ground, tinted by `hue`. */
export function photoImage(width = 1200, height = 900, hue = 0): Buffer {
  const r = new Raster(width, height)
  const tint = (c: RGB): RGB => [clamp8(c[0] + hue), clamp8(c[1] - hue * 0.4), clamp8(c[2] - hue)]
  r.verticalGradient(tint([96, 150, 214]), tint([244, 190, 140]), 0, Math.floor(height * 0.66))
  r.verticalGradient(tint([70, 110, 60]), tint([34, 62, 36]), Math.floor(height * 0.66), height)
  const cx = width * 0.68
  const cy = height * 0.32
  const rad = Math.min(width, height) * 0.1
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) if (Math.hypot(x - cx, y - cy) <= rad) r.setPixel(x, y, [255, 240, 200])
  }
  return encodePng(r)
}

export function upload(name: string, buffer: Buffer) {
  return { name, mimeType: 'image/png', buffer }
}
