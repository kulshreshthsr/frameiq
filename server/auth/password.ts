import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Password hashing for the owner admin account. Node's built-in `scrypt` (no
 * extra dependency) with a random salt per password and the algorithm's
 * parameters stored alongside the hash, so they can be strengthened later
 * without breaking existing accounts.
 *
 * Never logged, never compared with `===` (timing), never stored in plain
 * text — see `server/log.ts`'s redaction for the belt-and-braces version of
 * that same rule.
 */

// `promisify` only sees one of `scrypt`'s overloads; this is the one we use
// (with an explicit options object), spelled out so the call sites below
// type-check.
const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number, options: ScryptOptions) => Promise<Buffer>

const N = 16384 // CPU/memory cost
const R = 8
const P = 1
const KEY_LENGTH = 64

export const MIN_PASSWORD_LENGTH = 8

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P })
  return `scrypt:${N}:${R}:${P}:${salt.toString('hex')}:${derived.toString('hex')}`
}

/** Constant-time verification; never throws on a malformed stored hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts
  const n = Number(nStr)
  const r = Number(rStr)
  const p = Number(pStr)
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(saltHex, 'hex')
    expected = Buffer.from(hashHex, 'hex')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false
  const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, { N: n, r, p })
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
