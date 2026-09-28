import type { GlassId, MatId, Orientation } from '../domain/catalog'

/** Anything that can be drawn: a URL plus its pixel size. Test/sample images
 * used by the dev labs satisfy this without being persisted assets. */
export interface ImageRef {
  src: string
  width: number
  height: number
}

/** An image the customer supplied. `width`/`height` describe the (possibly
 * downscaled) working copy the canvas draws; `sourceWidth`/`sourceHeight` are
 * the original file's pixel size, kept so print quality can be judged against
 * what the customer actually uploaded. `assetId` keys the persisted blob. */
export interface UploadedImage extends ImageRef {
  assetId: string
  sourceWidth: number
  sourceHeight: number
}

export interface WallImage extends UploadedImage {
  /** Reserved for a future per-pixel occlusion mask (e.g. furniture in front
   * of the wall) so frames can be clipped where they'd otherwise render on
   * top of foreground objects. Unused today — see lib/occlusion.ts. */
  occlusionMaskSrc?: string | null
}

export type PhotoAsset = UploadedImage

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

/** A point on the placement surface in unit space: (0,0) is its top-left,
 * (1,1) its bottom-right. The surface is the whole wall photo in free mode,
 * or the customer-marked wall region in wall-surface mode. Because it's
 * normalized, an anchor survives changes to the photo, the region, or the
 * wall-width calibration. */
export interface SurfaceAnchor {
  xPct: number
  yPct: number
}

/**
 * What the customer designed for one frame. This — not the pixel geometry
 * below — is the source of truth; geometry is always re-derivable from it
 * (see domain/placement.ts).
 */
export interface FrameDesign {
  id: string
  /** The layout slot this frame came from, or a custom id for added frames. */
  slotId: string
  /** Where the frame's center sits on the placement surface. */
  anchor: SurfaceAnchor
  /** In-plane tilt in degrees (collage layouts tilt some frames). */
  tilt: number
  productId: string
  sizeId: string
  orientation: Orientation
  glassId: GlassId
  matId: MatId
}

/** Pixel geometry derived from a FrameDesign for the current wall/scale. */
export interface FrameGeometry {
  /** Center of the frame in wall-image pixels. */
  x: number
  y: number
  /** Flat (un-warped) outer size in wall-image pixels. */
  width: number
  height: number
  rotation: number
  perspective?: PerspectiveCorners
}

export interface FrameInstance extends FrameDesign, FrameGeometry {
  photo: PhotoAsset | null
  photoTransform: PhotoTransform
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
  defaultProductId: string
  spacing: 'tight' | 'normal' | 'relaxed'
  /** Slots give each frame's CENTER and tilt, plus a suggested footprint
   * (wPct × hPct of the placement surface). The suggested footprint only
   * seeds which physical size is chosen; the frame's real size then comes
   * from the catalog SKU, never from the slot. */
  slots: LayoutSlot[]
  decorativeElements?: DecorativeElement[]
}
