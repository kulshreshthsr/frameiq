/**
 * Minimal but structurally valid image headers for tests. They contain the
 * dimensions the inspector reads and nothing else — no pixel data — which is
 * exactly what the server needs to decide whether a photo is printable.
 */

export function pngBytes(width: number, height: number, extra = 0): Buffer {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'ascii')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[16] = 8 // bit depth
  ihdr[17] = 6 // RGBA
  // (CRC left zero — the inspector only reads the header.)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.alloc(extra, 1)])
}

/** A JPEG with optional EXIF orientation (1–8). */
export function jpegBytes(width: number, height: number, orientation?: number, extra = 0): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]
  if (orientation !== undefined) {
    // APP1 "Exif\0\0" + a little-endian TIFF with one IFD0 entry: Orientation.
    const tiff = Buffer.alloc(8 + 2 + 12 + 4)
    tiff.write('II', 0, 'ascii')
    tiff.writeUInt16LE(42, 2)
    tiff.writeUInt32LE(8, 4)
    tiff.writeUInt16LE(1, 8) // one entry
    tiff.writeUInt16LE(0x0112, 10) // tag: Orientation
    tiff.writeUInt16LE(3, 12) // type: SHORT
    tiff.writeUInt32LE(1, 14) // count
    tiff.writeUInt16LE(orientation, 18) // value
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff])
    const header = Buffer.alloc(4)
    header[0] = 0xff
    header[1] = 0xe1
    header.writeUInt16BE(body.length + 2, 2)
    parts.push(header, body)
  }
  const sof = Buffer.alloc(4 + 15)
  sof[0] = 0xff
  sof[1] = 0xc0
  sof.writeUInt16BE(17, 2)
  sof[4] = 8 // precision
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 3 // components
  parts.push(sof, Buffer.alloc(extra, 2), Buffer.from([0xff, 0xd9]))
  return Buffer.concat(parts)
}

/** A lossy (VP8) WebP header. */
export function webpBytes(width: number, height: number): Buffer {
  const b = Buffer.alloc(40)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(32, 4)
  b.write('WEBP', 8, 'ascii')
  b.write('VP8 ', 12, 'ascii')
  b.writeUInt32LE(20, 16)
  b[23] = 0x9d
  b[24] = 0x01
  b[25] = 0x2a
  b.writeUInt16LE(width, 26)
  b.writeUInt16LE(height, 28)
  return b
}
