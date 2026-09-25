// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { jpegBytes, pngBytes, webpBytes } from '../test/images.ts'
import { inspectImage } from './inspect.ts'

describe('inspectImage', () => {
  it('reads a PNG’s type and size from its own bytes', () => {
    expect(inspectImage(pngBytes(4032, 3024))).toEqual({ mime: 'image/png', width: 4032, height: 3024 })
  })

  it('reads a JPEG’s size', () => {
    expect(inspectImage(jpegBytes(6000, 4000))).toEqual({ mime: 'image/jpeg', width: 6000, height: 4000 })
  })

  it('reads a WebP’s size', () => {
    expect(inspectImage(webpBytes(1920, 1080))).toEqual({ mime: 'image/webp', width: 1920, height: 1080 })
  })

  it.each([1, 2, 3, 4])('EXIF orientation %i leaves the displayed size alone', (orientation) => {
    expect(inspectImage(jpegBytes(4000, 3000, orientation))).toMatchObject({ width: 4000, height: 3000 })
  })

  it.each([5, 6, 7, 8])('EXIF orientation %i swaps the sides — a phone photo stored sideways is portrait when displayed', (orientation) => {
    // This is the trap: the browser measured the photo as displayed (3000 × 4000),
    // so the server must too, or every phone portrait would look mismatched.
    expect(inspectImage(jpegBytes(4000, 3000, orientation))).toMatchObject({ width: 3000, height: 4000 })
  })

  it('ignores an out-of-range orientation value', () => {
    expect(inspectImage(jpegBytes(4000, 3000, 9))).toMatchObject({ width: 4000, height: 3000 })
  })

  it('does not trust a file that merely claims to be an image', () => {
    expect(inspectImage(Buffer.from('<html>not an image</html>'))).toBeNull()
    expect(inspectImage(Buffer.from('GIF89a...........'))).toBeNull()
    expect(inspectImage(Buffer.alloc(0))).toBeNull()
    expect(inspectImage(Buffer.alloc(100))).toBeNull()
  })

  it('refuses truncated or malformed files without throwing', () => {
    expect(inspectImage(pngBytes(100, 100).subarray(0, 14))).toBeNull()
    expect(inspectImage(jpegBytes(100, 100).subarray(0, 6))).toBeNull()
    expect(inspectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]))).toBeNull()
  })

  it('refuses zero-sized and absurd dimensions', () => {
    expect(inspectImage(pngBytes(0, 100))).toBeNull()
    expect(inspectImage(pngBytes(100, 0))).toBeNull()
    expect(inspectImage(pngBytes(4_000_000_000, 100))).toBeNull()
  })

  it('a text file renamed .jpg is still text', () => {
    expect(inspectImage(Buffer.from('just some notes.jpg'))).toBeNull()
  })
})
