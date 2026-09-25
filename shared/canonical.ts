/**
 * Canonical JSON: the same value always serialises to the same string —
 * object keys sorted, `undefined` dropped. Used wherever two parties must
 * agree on a fingerprint (the design snapshot's digest, an order request's
 * idempotency hash) without caring how each built its object.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key]
      if (child !== undefined) out[key] = sortKeys(child)
    }
    return out
  }
  return value
}

/** Rounds to a fixed number of decimals so floating-point noise (0.30000000000000004)
 * can never make two identical designs look different. */
export function roundTo(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}
