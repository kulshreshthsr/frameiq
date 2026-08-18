export interface WallImage {
  src: string
  width: number
  height: number
  /** Reserved for a future per-pixel occlusion mask (e.g. furniture in front
   * of the wall) so frames can be clipped where they'd otherwise render on
   * top of foreground objects. Unused today — see lib/occlusion.ts. */
  occlusionMaskSrc?: string | null
}

export interface PhotoAsset {
  src: string
  width: number
  height: number
}

export interface PhotoTransform {
  offsetX: number
  offsetY: number
  scale: number
  rotation: number
}

/**
 * Data-driven description of a physical frame moulding. One rendering
 * system (FrameMoulding + GlassAndHighlight) reads this config and draws
 * every style — there is no per-style component.
 */
export interface FrameStyleConfig {
  id: string
  name: string
  /** 'wood' gets procedural grain; 'painted'/'metal' stay smooth. */
  material: 'wood' | 'painted' | 'metal'

  /** Fractions of the frame's shorter side — keep proportions consistent across layouts/resolutions. */
  outerThicknessRatio: number
  innerThicknessRatio: number

  /** Base moulding color; bevel shading is derived from this at render time. */
  woodColor: string
  matColor: string | null
  glassTintColor: string

  /** 0–1 multipliers controlling how pronounced each visual effect is. */
  bevelStrength: number
  glassOpacity: number
  highlightStrength: number
  shadowStrength: number
  grainOpacity: number

  physicalThicknessRatio: number
}

/**
 * Four independent corner points driving true projective placement on an
 * angled wall — a genuine homography warp (see lib/perspective.ts and
 * PerspectiveMesh.tsx), not an affine approximation. Konva's Transformer
 * only produces affine transforms (translate/scale/rotate/skew), which is
 * why this is a separate concept from FrameInstance.rotation rather than an
 * extra angle: rotation is a plain in-plane spin, this is genuine
 * foreshortening from viewing a flat rectangle off-axis.
 */
export interface PerspectiveCorners {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
}

export interface FrameInstance {
  id: string
  slotId: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  styleId: string
  photo: PhotoAsset | null
  photoTransform: PhotoTransform
  perspective?: PerspectiveCorners
}

export interface LayoutSlot {
  id: string
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  rotation?: number
}

export interface DecorativeElement {
  type: 'line' | 'shelf'
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  color: string
  opacity?: number
}

export interface LayoutDefinition {
  id: string
  name: string
  description: string
  /** Wall orientation this arrangement was designed for; purely advisory metadata shown in the UI. */
  allowedOrientation: 'landscape' | 'portrait' | 'any'
  defaultStyleId: string
  spacing: 'tight' | 'normal' | 'relaxed'
  slots: LayoutSlot[]
  decorativeElements?: DecorativeElement[]
}
