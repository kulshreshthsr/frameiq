import { UserFacingError } from './errors'

/**
 * SAFE EXPORT
 *
 * Browsers cap canvas size, and they cap it differently: iOS Safari refuses
 * anything above 16,777,216 pixels total, most mobile browsers get unstable
 * well before their nominal limit, and desktop browsers allow far more. An
 * over-limit canvas doesn't throw — it quietly returns an EMPTY image. That
 * is the failure this module exists to prevent: we plan a size that fits the
 * device, verify the canvas really can hold it, and if a render still comes
 * back empty we retry smaller instead of handing the customer a blank file.
 *
 * Everything except `canvasCanHold` is pure and unit-tested.
 */

export interface CanvasLimits {
  /** Longest side, in pixels. */
  maxEdge: number
  /** Total pixels (width × height). */
  maxArea: number
}

/** iOS Safari's hard ceiling is 16,777,216 px (4096²); we stay at it exactly. */
export const MOBILE_LIMITS: CanvasLimits = { maxEdge: 4096, maxArea: 4096 * 4096 }
/** Comfortably inside every current desktop browser's limits. */
export const DESKTOP_LIMITS: CanvasLimits = { maxEdge: 8192, maxArea: 8192 * 6144 }

export interface EnvironmentHints {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
}

export function detectCanvasLimits(env: EnvironmentHints | null = readEnvironment()): CanvasLimits {
  if (!env) return MOBILE_LIMITS // unknown environment: be conservative
  const mobileAgent = /iPhone|iPad|iPod|Android|Mobile/i.test(env.userAgent)
  // iPadOS reports itself as a Mac; touch points give it away.
  const ipadOs = env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1
  return mobileAgent || ipadOs ? MOBILE_LIMITS : DESKTOP_LIMITS
}

function readEnvironment(): EnvironmentHints | null {
  if (typeof navigator === 'undefined') return null
  return { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }
}

export interface Size {
  width: number
  height: number
}

export interface ExportPlan extends Size {
  requested: Size
  /** True when the output is smaller than the full-resolution composition. */
  reduced: boolean
}

/** The largest size ≤ requested that respects both limits, aspect ratio
 * preserved. Never returns less than 1×1. */
export function planExport(requested: Size, limits: CanvasLimits): ExportPlan {
  const w = Math.max(1, Math.round(requested.width))
  const h = Math.max(1, Math.round(requested.height))
  const factor = Math.min(1, limits.maxEdge / Math.max(w, h), Math.sqrt(limits.maxArea / (w * h)))
  if (factor >= 1) return { width: w, height: h, requested: { width: w, height: h }, reduced: false }
  return {
    width: Math.max(1, Math.floor(w * factor)),
    height: Math.max(1, Math.floor(h * factor)),
    requested: { width: w, height: h },
    reduced: true,
  }
}

/** Shrinks a plan by `factor`, keeping the aspect ratio. */
export function shrinkPlan(plan: ExportPlan, factor: number): ExportPlan {
  return {
    width: Math.max(1, Math.floor(plan.width * factor)),
    height: Math.max(1, Math.floor(plan.height * factor)),
    requested: plan.requested,
    reduced: true,
  }
}

/** Can a canvas of this size actually be created and drawn on? The reliable
 * test is to draw in its far corner and read it back: an over-limit canvas
 * silently ignores the draw. */
export function canvasCanHold(width: number, height: number): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.fillStyle = '#000'
    ctx.fillRect(width - 1, height - 1, 1, 1)
    return ctx.getImageData(width - 1, height - 1, 1, 1).data[3] === 255
  } catch {
    return false
  }
}

const MIN_EXPORT_EDGE = 640
const SHRINK_FACTOR = 0.75
const MAX_ATTEMPTS = 6
/** A real composition never encodes to a few dozen bytes. */
const MIN_PLAUSIBLE_BYTES = 200

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  reduced: boolean
}

/**
 * Plans a device-safe size, then renders — retrying smaller if the canvas
 * can't hold it or the render comes back empty. `probe` and `render` are
 * injected so the whole policy is testable without a browser.
 */
export async function exportWithFallback(
  requested: Size,
  limits: CanvasLimits,
  probe: (width: number, height: number) => boolean,
  render: (plan: ExportPlan) => Promise<Blob | null>,
): Promise<ExportResult> {
  let plan = planExport(requested, limits)

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Math.max(plan.width, plan.height) < MIN_EXPORT_EDGE && attempt > 0) break

    if (probe(plan.width, plan.height)) {
      let blob: Blob | null = null
      try {
        blob = await render(plan)
      } catch {
        blob = null
      }
      if (blob && blob.size >= MIN_PLAUSIBLE_BYTES) {
        return { blob, width: plan.width, height: plan.height, reduced: plan.reduced }
      }
    }
    plan = shrinkPlan(plan, SHRINK_FACTOR)
  }

  throw new UserFacingError(
    `We couldn't create the image on this device. Try the full-screen preview and take a screenshot instead.`,
  )
}

/** Plain-language note shown when the saved image is smaller than the
 * composition. Null when nothing was reduced. */
export function describeReduction(result: Pick<ExportResult, 'width' | 'height' | 'reduced'>): string | null {
  if (!result.reduced) return null
  return `Saved at ${result.width} × ${result.height} px — the largest size your device can safely create.`
}
