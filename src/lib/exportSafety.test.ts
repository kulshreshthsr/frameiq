import { describe, expect, it, vi } from 'vitest'
import { UserFacingError } from './errors'
import {
  DESKTOP_LIMITS,
  MOBILE_LIMITS,
  describeReduction,
  detectCanvasLimits,
  exportWithFallback,
  planExport,
  shrinkPlan,
  type ExportPlan,
} from './exportSafety'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

const area = (s: { width: number; height: number }) => s.width * s.height
const blobOf = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/png' })

describe('detectCanvasLimits', () => {
  it('uses the strict limit on iPhone (iOS Safari caps canvases at 16,777,216 px)', () => {
    expect(detectCanvasLimits({ userAgent: IPHONE })).toEqual(MOBILE_LIMITS)
    expect(MOBILE_LIMITS.maxArea).toBe(16_777_216)
  })

  it('is conservative on Android', () => {
    expect(detectCanvasLimits({ userAgent: ANDROID })).toEqual(MOBILE_LIMITS)
  })

  it('recognises iPadOS, which reports itself as a desktop Mac', () => {
    expect(detectCanvasLimits({ userAgent: IPADOS, platform: 'MacIntel', maxTouchPoints: 5 })).toEqual(MOBILE_LIMITS)
  })

  it('a real desktop Mac (no touch) gets the desktop limit', () => {
    expect(detectCanvasLimits({ userAgent: IPADOS, platform: 'MacIntel', maxTouchPoints: 0 })).toEqual(DESKTOP_LIMITS)
  })

  it('allows more on desktop', () => {
    expect(detectCanvasLimits({ userAgent: DESKTOP })).toEqual(DESKTOP_LIMITS)
  })

  it('assumes the strict limit when the environment is unknown', () => {
    expect(detectCanvasLimits(null)).toEqual(MOBILE_LIMITS)
  })
})

describe('planExport', () => {
  it('leaves a size that fits untouched', () => {
    const plan = planExport({ width: 3000, height: 2000 }, DESKTOP_LIMITS)
    expect(plan).toMatchObject({ width: 3000, height: 2000, reduced: false })
  })

  it('caps the working-size maximum (6000×4500) for a phone, preserving aspect ratio', () => {
    const plan = planExport({ width: 6000, height: 4500 }, MOBILE_LIMITS)
    expect(plan.reduced).toBe(true)
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(MOBILE_LIMITS.maxEdge)
    expect(area(plan)).toBeLessThanOrEqual(MOBILE_LIMITS.maxArea)
    expect(plan.width / plan.height).toBeCloseTo(6000 / 4500, 2)
    expect(plan.requested).toEqual({ width: 6000, height: 4500 })
  })

  it('respects the area limit even when the longest edge is fine', () => {
    // 4096×4096 is exactly at the limit; 4096×4097 must come down.
    expect(planExport({ width: 4096, height: 4096 }, MOBILE_LIMITS).reduced).toBe(false)
    const over = planExport({ width: 4096, height: 4097 }, MOBILE_LIMITS)
    expect(over.reduced).toBe(true)
    expect(area(over)).toBeLessThanOrEqual(MOBILE_LIMITS.maxArea)
  })

  it('handles extreme aspect ratios', () => {
    const wide = planExport({ width: 20000, height: 400 }, MOBILE_LIMITS)
    expect(wide.width).toBeLessThanOrEqual(4096)
    expect(wide.height).toBeGreaterThanOrEqual(1)
    // Integer pixel rounding on an 82px-tall result allows ~1% ratio drift.
    expect(Math.abs(wide.width / wide.height / 50 - 1)).toBeLessThan(0.02)
  })

  it('always returns at least 1×1, and never NaN, for nonsense input', () => {
    for (const bad of [{ width: 0, height: 0 }, { width: -5, height: 10 }, { width: 0.2, height: 0.2 }]) {
      const plan = planExport(bad, MOBILE_LIMITS)
      expect(plan.width).toBeGreaterThanOrEqual(1)
      expect(plan.height).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(plan.width) && Number.isFinite(plan.height)).toBe(true)
    }
  })

  it('never exceeds the requested size (no upscaling)', () => {
    const plan = planExport({ width: 800, height: 600 }, DESKTOP_LIMITS)
    expect(plan.width).toBe(800)
    expect(plan.height).toBe(600)
  })

  it('shrinkPlan reduces while keeping the ratio and marking it reduced', () => {
    const base = planExport({ width: 4000, height: 3000 }, DESKTOP_LIMITS)
    const smaller = shrinkPlan(base, 0.5)
    expect(smaller).toMatchObject({ width: 2000, height: 1500, reduced: true })
  })
})

describe('exportWithFallback', () => {
  const requested = { width: 6000, height: 4500 }

  it('renders at the planned size when everything works', async () => {
    const render = vi.fn(async (_plan: ExportPlan) => blobOf(5000))
    const result = await exportWithFallback(requested, DESKTOP_LIMITS, () => true, render)
    expect(result).toMatchObject({ width: 6000, height: 4500, reduced: false })
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('reports a reduction when the device limit forced one', async () => {
    const result = await exportWithFallback(requested, MOBILE_LIMITS, () => true, async () => blobOf(5000))
    expect(result.reduced).toBe(true)
    expect(result.width).toBeLessThanOrEqual(4096)
  })

  it('retries smaller when the canvas probe says the size will not fit', async () => {
    const probe = vi.fn((w: number) => w <= 3000)
    const result = await exportWithFallback(requested, DESKTOP_LIMITS, probe, async () => blobOf(5000))
    expect(result.width).toBeLessThanOrEqual(3000)
    expect(result.reduced).toBe(true)
  })

  it('retries smaller when the browser silently returns nothing (the blank-export failure)', async () => {
    let calls = 0
    const render = async () => (++calls < 3 ? null : blobOf(5000))
    const result = await exportWithFallback(requested, DESKTOP_LIMITS, () => true, render)
    expect(calls).toBe(3)
    expect(result.reduced).toBe(true)
  })

  it('treats a suspiciously tiny file as a failed (blank) render, never as success', async () => {
    let calls = 0
    const render = async () => (++calls < 2 ? blobOf(20) : blobOf(9000))
    const result = await exportWithFallback(requested, DESKTOP_LIMITS, () => true, render)
    expect(result.blob.size).toBe(9000)
    expect(calls).toBe(2)
  })

  it('survives the renderer throwing', async () => {
    let calls = 0
    const render = async () => {
      if (++calls < 2) throw new Error('canvas exploded')
      return blobOf(5000)
    }
    await expect(exportWithFallback(requested, DESKTOP_LIMITS, () => true, render)).resolves.toBeDefined()
  })

  it('fails with a customer-friendly error — never a blank file — when nothing works', async () => {
    const error = await exportWithFallback(requested, DESKTOP_LIMITS, () => true, async () => null).catch((e) => e)
    expect(error).toBeInstanceOf(UserFacingError)
    expect(error.message).not.toMatch(/canvas|null|undefined/i)
  })

  it('gives up when even tiny canvases are refused', async () => {
    await expect(exportWithFallback(requested, DESKTOP_LIMITS, () => false, async () => blobOf(5000))).rejects.toBeInstanceOf(UserFacingError)
  })

  it('bounds its retries', async () => {
    const render = vi.fn(async () => null)
    await exportWithFallback(requested, DESKTOP_LIMITS, () => true, render).catch(() => {})
    expect(render.mock.calls.length).toBeLessThanOrEqual(6)
  })
})

describe('describeReduction', () => {
  it('explains a reduction in plain words', () => {
    const text = describeReduction({ width: 4096, height: 3072, reduced: true })
    expect(text).toContain('4096 × 3072')
    expect(text).not.toMatch(/canvas|limit exceeded/i)
  })

  it('says nothing when the image was not reduced', () => {
    expect(describeReduction({ width: 100, height: 100, reduced: false })).toBeNull()
  })
})
