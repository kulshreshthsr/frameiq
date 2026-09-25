/**
 * A small in-memory rate limiter (fixed window per key). It is a speed bump
 * against accidental hammering and casual abuse of the expensive endpoints —
 * uploads, order creation, payment start — not a substitute for a firewall.
 * State is per process, which matches how this server runs.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()
  private readonly windowMs: number
  private readonly now: () => number

  constructor(windowMs: number, now: () => number = Date.now) {
    this.windowMs = windowMs
    this.now = now
  }

  /** Returns true if the call is allowed. */
  allow(key: string, max: number): boolean {
    const t = this.now()
    const entry = this.hits.get(key)
    if (!entry || t >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs })
      this.prune(t)
      return true
    }
    entry.count += 1
    return entry.count <= max
  }

  private prune(t: number) {
    if (this.hits.size < 5000) return
    for (const [key, entry] of this.hits) if (t >= entry.resetAt) this.hits.delete(key)
  }
}
