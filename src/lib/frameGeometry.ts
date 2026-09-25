import type { FrameStyleConfig, PhotoTransform } from '../types/frame'
import { clamp, coverScale } from './geometry'

export interface InnerOpening {
  outerThickness: number
  innerThickness: number
  width: number
  height: number
}

export interface ContactShadowLayer {
  blur: number
  offsetX: number
  offsetY: number
  opacity: number
}

export interface ContactShadowLayers {
  /** Larger, fainter pass for the ambient falloff extending out from the frame. */
  soft: ContactShadowLayer
  /** Small, crisper pass right at the frame's edge, where it meets the wall. */
  tight: ContactShadowLayer
}

/**
 * The scene's single light direction: from above and a little to the left.
 * The moulding's bevel shading (FrameMoulding: bright top/left, dark
 * bottom/right) and the contact shadow both derive from this, so they always
 * agree. The shadow therefore falls down AND to the right; `LIGHT_SHADOW_SKEW`
 * is how far right it drifts per unit of downward offset (0 = light directly
 * overhead, 1 = light at 45°). The bevel is lit mostly from above, so this
 * stays well under 1.
 */
export const LIGHT_SHADOW_SKEW = 0.4

/**
 * Two stacked shadow passes approximating a soft contact shadow: a tight
 * pass hugging the frame's edge plus a wider, fainter pass for the ambient
 * falloff — stronger near the frame, fading outward, rather than a single
 * flat offset blur. The offset is deliberately small and stays in wall-space
 * (not rotated with the frame's own tilt): a picture tilted on the wall
 * still has its shadow fall the same way in the room, not rotated to follow
 * the frame. A thicker physical moulding (physicalThicknessRatio) stands
 * further off the wall and casts a slightly longer, softer shadow.
 *
 * lightingFactor (default 1, from the wall's sampled ambient brightness)
 * only nudges opacity within a tight band — a lighting *response*, not a
 * relight.
 */
export function computeContactShadowLayers(
  refDim: number,
  style: FrameStyleConfig,
  lightingFactor = 1,
): ContactShadowLayers {
  const lift = refDim * style.physicalThicknessRatio * style.shadowStrength
  const opacityFactor = clamp(1 + (lightingFactor - 1) * 0.4, 0.75, 1.15)
  const tightDrop = clamp(lift * 0.35, 1, 6)
  const softDrop = clamp(lift * 0.9, 3, 20)
  return {
    tight: {
      blur: clamp(refDim * 0.012 * style.shadowStrength, 1.5, 8),
      offsetX: tightDrop * LIGHT_SHADOW_SKEW,
      offsetY: tightDrop,
      opacity: clamp(0.38 * opacityFactor, 0.15, 0.5),
    },
    soft: {
      blur: clamp(refDim * 0.05 * style.shadowStrength, 8, 40),
      offsetX: softDrop * LIGHT_SHADOW_SKEW,
      offsetY: softDrop,
      opacity: clamp(0.16 * opacityFactor, 0.05, 0.24),
    },
  }
}

/**
 * Single source of truth for a frame's photo-opening geometry. Used by both
 * the renderer (to draw the moulding/mat/opening) and the composition store
 * (to keep a photo's crop framing sane whenever the opening's size changes).
 */
export function computeInnerOpening(width: number, height: number, style: FrameStyleConfig): InnerOpening {
  const refDim = Math.min(width, height)
  const outerThickness = Math.max(2, style.outerThicknessRatio * refDim)
  const innerThickness = style.matColor ? Math.max(0, style.innerThicknessRatio * refDim) : 0
  const inset = outerThickness + innerThickness
  return {
    outerThickness,
    innerThickness,
    width: Math.max(1, width - 2 * inset),
    height: Math.max(1, height - 2 * inset),
  }
}

/** Cover-fit scale that accounts for a photo being rotated ~90°/270°, where
 * its effective footprint is transposed. */
export function coverScaleForRotation(
  innerWidth: number,
  innerHeight: number,
  photoWidth: number,
  photoHeight: number,
  rotationDeg: number,
): number {
  const normalized = ((rotationDeg % 180) + 180) % 180
  const isQuarterTurn = normalized > 45 && normalized < 135
  const effectiveWidth = isQuarterTurn ? photoHeight : photoWidth
  const effectiveHeight = isQuarterTurn ? photoWidth : photoHeight
  return coverScale(innerWidth, innerHeight, effectiveWidth, effectiveHeight)
}

/**
 * Clamps a photo's pan offset so it can never reveal a gap at the opening's
 * edge — the one property a cover-fit crop must always guarantee. Uses the
 * axis-aligned bounding box of the (possibly rotated) photo at its current
 * scale; exact for 0/90/180/270° rotation, a safe conservative bound for
 * any in-between angle from fine rotation.
 */
export function clampPhotoPan(
  offsetX: number,
  offsetY: number,
  scale: number,
  rotationDeg: number,
  innerWidth: number,
  innerHeight: number,
  photoWidth: number,
  photoHeight: number,
): { offsetX: number; offsetY: number } {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const boundingWidth = (photoWidth * cos + photoHeight * sin) * scale
  const boundingHeight = (photoWidth * sin + photoHeight * cos) * scale
  const maxOffsetX = Math.max(0, (boundingWidth - innerWidth) / 2)
  const maxOffsetY = Math.max(0, (boundingHeight - innerHeight) / 2)
  return {
    offsetX: clamp(offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(offsetY, -maxOffsetY, maxOffsetY),
  }
}

/**
 * Rescales a photo's pan/zoom transform when the opening it sits in changes
 * size (frame resize, style swap, or layout switch), so the crop framing
 * the customer chose stays visually equivalent instead of jumping.
 *
 * Rescales by the ratio between the old and new *minimum cover scale*
 * (rotation-aware) rather than a naive average-of-dimensions ratio — the
 * naive version silently broke cover-fit whenever an opening's aspect
 * ratio changed (a non-uniform resize, or a style swap with a different
 * mat/border ratio), since a uniform "keep the same average size" factor
 * doesn't track the true per-axis coverage requirement. The offset is
 * scaled by the same ratio, then clamped as a final safety net.
 */
export function rescalePhotoTransform(
  transform: PhotoTransform,
  oldInner: { width: number; height: number },
  newInner: { width: number; height: number },
  photo: { width: number; height: number },
): PhotoTransform {
  const oldMinScale = coverScaleForRotation(oldInner.width, oldInner.height, photo.width, photo.height, transform.rotation)
  const newMinScale = coverScaleForRotation(newInner.width, newInner.height, photo.width, photo.height, transform.rotation)
  if (oldMinScale <= 0) return transform
  const ratio = newMinScale / oldMinScale
  const scale = Math.max(transform.scale * ratio, newMinScale)
  const { offsetX, offsetY } = clampPhotoPan(
    transform.offsetX * ratio,
    transform.offsetY * ratio,
    scale,
    transform.rotation,
    newInner.width,
    newInner.height,
    photo.width,
    photo.height,
  )
  return { offsetX, offsetY, scale, rotation: transform.rotation }
}

export type MouldingEdgeName = 'top' | 'right' | 'bottom' | 'left'

export interface MouldingEdge {
  points: number[]
  gradientStart: { x: number; y: number }
  gradientEnd: { x: number; y: number }
}

/** The four mitred trapezoids that make up a moulding ring, each with a
 * gradient axis running from its outer edge to its inner edge. */
export function computeMouldingEdges(width: number, height: number, thickness: number): Record<MouldingEdgeName, MouldingEdge> {
  const t = thickness
  return {
    top: {
      points: [0, 0, width, 0, width - t, t, t, t],
      gradientStart: { x: 0, y: 0 },
      gradientEnd: { x: 0, y: t },
    },
    right: {
      points: [width, 0, width, height, width - t, height - t, width - t, t],
      gradientStart: { x: width, y: 0 },
      gradientEnd: { x: width - t, y: 0 },
    },
    bottom: {
      points: [width, height, 0, height, t, height - t, width - t, height - t],
      gradientStart: { x: 0, y: height },
      gradientEnd: { x: 0, y: height - t },
    },
    left: {
      points: [0, height, 0, 0, t, t, t, height - t],
      gradientStart: { x: 0, y: 0 },
      gradientEnd: { x: t, y: 0 },
    },
  }
}

/** Short parallel lines within one moulding edge, roughly following the
 * grain direction of that piece of wood. Deterministic per (styleId, edge)
 * so it doesn't jitter across re-renders. */
export function generateGrainLines(
  edge: MouldingEdgeName,
  width: number,
  height: number,
  thickness: number,
  count: number,
  rng: () => number,
): number[][] {
  const lines: number[][] = []
  const margin = thickness * 0.35
  for (let i = 0; i < count; i++) {
    const f = (i + 1) / (count + 1) + (rng() - 0.5) * 0.1
    const depth = Math.min(thickness - 1, Math.max(1, f * thickness))
    const jitterA = rng() * margin
    const jitterB = rng() * margin
    if (edge === 'top') {
      lines.push([margin + jitterA, depth, width - margin - jitterB, depth])
    } else if (edge === 'bottom') {
      const y = height - depth
      lines.push([margin + jitterA, y, width - margin - jitterB, y])
    } else if (edge === 'left') {
      lines.push([depth, margin + jitterA, depth, height - margin - jitterB])
    } else {
      const x = width - depth
      lines.push([x, margin + jitterA, x, height - margin - jitterB])
    }
  }
  return lines
}
