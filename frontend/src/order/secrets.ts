/**
 * Random, URL-safe secrets generated in the browser.
 *
 *  - The ACCESS TOKEN is what proves, later, that the same customer is asking
 *    about an order (there are no accounts). 32 random bytes; the server
 *    stores only a hash of it.
 *  - The IDEMPOTENCY KEY makes "create this order" safe to repeat: the same
 *    key always yields the same single order.
 */

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const newAccessToken = (): string => randomBase64Url(32)
export const newIdempotencyKey = (): string => `idem_${randomBase64Url(24)}`
