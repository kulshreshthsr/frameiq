import { create } from 'zustand'
import type { FrameInstance, LayoutSlot, PerspectiveCorners, PhotoAsset, PhotoTransform, WallImage } from '../types/frame'
import { createId } from '../lib/id'
import { DEFAULT_LAYOUT_ID, getLayout } from '../lib/layouts'
import { DEFAULT_FRAME_STYLE_ID, getFrameStyle } from '../lib/frameStyles'
import { coverScale } from '../lib/geometry'
import { clampPhotoPan, computeInnerOpening, coverScaleForRotation, rescalePhotoTransform } from '../lib/frameGeometry'
import {
  computeDefaultCorners,
  computeRegionDimensions,
  computeSlotCornersInUnitSpace,
  computeSquareToQuadHomography,
  mapQuadThroughHomography,
  quadCentroid,
  computeQuadTiltAngle,
} from '../lib/perspective'
import { revokeIfBlobUrl } from '../lib/objectUrl'
import { useUIStore } from './uiStore'

const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 }
const MAX_HISTORY = 50

export type PlacementMode = 'free' | 'wall-surface'

/** The slice of composition state Undo/Redo tracks. Deliberately excludes
 * `wall` — replacing the wall photo revokes the previous one's object URL
 * immediately (see setWall), so it can never be safely restored and isn't
 * part of the history timeline. */
interface HistorySnapshot {
  frames: FrameInstance[]
  activeLayoutId: string
  activeStyleId: string
  hasCustomStyle: boolean
  placementMode: PlacementMode
  wallRegion: PerspectiveCorners | null
}

/**
 * Pure render/composition data — the wall image and the frames on it. UI
 * concerns (selection, viewport, upload status) live in `uiStore` instead,
 * so this store only ever holds what the canvas actually renders.
 */
interface CompositionState {
  wall: WallImage | null
  frames: FrameInstance[]
  activeLayoutId: string
  activeStyleId: string
  /** True once the customer has explicitly picked a style for the whole wall
   * (setAllFramesStyle). Until then, each layout's own curated defaultStyleId
   * is used for newly-created frames; afterward, their choice takes priority
   * for every new frame so switching layouts never mixes in a style they
   * never picked. */
  hasCustomStyle: boolean

  /** Mode A ('free') places frames directly on the wall's own rectangle.
   * Mode B ('wall-surface') maps the whole layout into `wallRegion` instead,
   * so it renders correctly on a wall photographed at an angle. */
  placementMode: PlacementMode
  /** The customer-defined quad marking the flat wall surface within the
   * photo. Null until "Select Wall" has been completed. */
  wallRegion: PerspectiveCorners | null

  past: HistorySnapshot[]
  future: HistorySnapshot[]
  undo: () => void
  redo: () => void

  setWall: (wall: WallImage) => void
  resetComposition: () => void
  applyLayout: (layoutId: string) => void
  setFrameStyle: (frameId: string, styleId: string) => void
  setAllFramesStyle: (styleId: string) => void
  setFramePhoto: (frameId: string, photo: PhotoAsset) => void
  updateFrameTransform: (
    frameId: string,
    partial: Partial<Pick<FrameInstance, 'x' | 'y' | 'width' | 'height' | 'rotation'>>,
  ) => void
  updateFramePhotoTransform: (frameId: string, partial: Partial<PhotoTransform>) => void
  autoFitPhoto: (frameId: string) => void
  rotatePhoto90: (frameId: string, direction: 1 | -1) => void
  addFrame: () => void
  removeFrame: (frameId: string) => void

  /** Enables perspective mode for a frame (if not already) and resets its
   * corners to the identity rectangle matching its current x/y/width/height/rotation. */
  setDefaultPerspective: (frameId: string) => void
  /** Fully removes the perspective override — the frame returns to normal
   * rectangular (Transformer-editable) rendering. */
  clearPerspective: (frameId: string) => void
  updatePerspectiveCorner: (
    frameId: string,
    corner: keyof PerspectiveCorners,
    point: { x: number; y: number },
  ) => void

  setPlacementMode: (mode: PlacementMode) => void
  setWallRegion: (region: PerspectiveCorners) => void
  updateWallRegionCorner: (corner: keyof PerspectiveCorners, point: { x: number; y: number }) => void
  resetWallRegion: () => void
}

function initialPhotoTransform(width: number, height: number, styleId: string, photo: PhotoAsset): PhotoTransform {
  const opening = computeInnerOpening(width, height, getFrameStyle(styleId))
  const scale = coverScale(opening.width, opening.height, photo.width, photo.height)
  return { offsetX: 0, offsetY: 0, scale, rotation: 0 }
}

function snapshotOf(state: CompositionState): HistorySnapshot {
  return {
    frames: state.frames,
    activeLayoutId: state.activeLayoutId,
    activeStyleId: state.activeStyleId,
    hasCustomStyle: state.hasCustomStyle,
    placementMode: state.placementMode,
    wallRegion: state.wallRegion,
  }
}

interface SlotGeometry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  perspective?: PerspectiveCorners
}

/**
 * Single source of truth for turning a layout slot's normalized coordinates
 * into actual frame geometry. In free mode that's a plain linear scale onto
 * the wall's own rectangle. In wall-surface mode, the slot's corners (in the
 * same normalized space its xPct/yPct/wPct/hPct already live in) are mapped
 * through the wall region's homography instead — the whole layout rides the
 * same projective transform, so relative spacing between frames survives
 * the warp exactly the way it would on a real angled wall.
 */
function computeSlotGeometry(
  slot: LayoutSlot,
  wall: WallImage,
  placementMode: PlacementMode,
  wallRegion: PerspectiveCorners | null,
): SlotGeometry {
  if (placementMode === 'wall-surface' && wallRegion) {
    const homography = computeSquareToQuadHomography(wallRegion)
    const regionDims = computeRegionDimensions(wallRegion)
    const width = slot.wPct * regionDims.width
    const height = slot.hPct * regionDims.height
    const unitCorners = computeSlotCornersInUnitSpace(slot.xPct, slot.yPct, slot.wPct, slot.hPct, slot.rotation ?? 0)
    const perspective = mapQuadThroughHomography(homography, unitCorners)
    const centroid = quadCentroid(perspective)
    return {
      x: centroid.x,
      y: centroid.y,
      width,
      height,
      rotation: (computeQuadTiltAngle(perspective) * 180) / Math.PI,
      perspective,
    }
  }
  return {
    x: slot.xPct * wall.width,
    y: slot.yPct * wall.height,
    width: slot.wPct * wall.width,
    height: slot.hPct * wall.height,
    rotation: slot.rotation ?? 0,
    perspective: undefined,
  }
}

/** Nearest-neighbour reassignment: each new slot claims the closest not-yet-used
 * previous frame that still has a photo, so switching layouts keeps photos near
 * where the customer put them instead of requiring re-upload. */
function buildFramesForLayout(
  layoutId: string,
  wall: WallImage,
  previousFrames: FrameInstance[],
  fallbackStyleId: string,
  hasCustomStyle: boolean,
  placementMode: PlacementMode,
  wallRegion: PerspectiveCorners | null,
): FrameInstance[] {
  const layout = getLayout(layoutId)
  const usedIndices = new Set<number>()

  return layout.slots.map((slot) => {
    let bestIndex = -1
    let bestDist = Infinity
    previousFrames.forEach((frame, index) => {
      if (usedIndices.has(index) || !frame.photo) return
      const oldXPct = frame.x / wall.width
      const oldYPct = frame.y / wall.height
      const dist = (oldXPct - slot.xPct) ** 2 + (oldYPct - slot.yPct) ** 2
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    })
    const carriedOver = bestIndex >= 0 ? previousFrames[bestIndex] : undefined
    if (bestIndex >= 0) usedIndices.add(bestIndex)

    const geometry = computeSlotGeometry(slot, wall, placementMode, wallRegion)
    // Once the customer has explicitly chosen a style, it wins for every new
    // frame — otherwise switching layouts could mix in a style they never
    // picked (and the style picker's "active" highlight would disagree with
    // what's actually rendered). Only before that choice does each layout's
    // own curated defaultStyleId apply, to show a nicely pre-styled preview.
    const styleId = carriedOver?.styleId ?? (hasCustomStyle ? fallbackStyleId : layout.defaultStyleId ?? fallbackStyleId)

    let photoTransform = DEFAULT_PHOTO_TRANSFORM
    if (carriedOver?.photo) {
      const oldStyle = getFrameStyle(carriedOver.styleId)
      const oldInner = computeInnerOpening(carriedOver.width, carriedOver.height, oldStyle)
      const newInner = computeInnerOpening(geometry.width, geometry.height, getFrameStyle(styleId))
      photoTransform = rescalePhotoTransform(carriedOver.photoTransform, oldInner, newInner, carriedOver.photo)
    }

    return {
      id: createId('frame'),
      slotId: slot.id,
      ...geometry,
      styleId,
      photo: carriedOver?.photo ?? null,
      photoTransform,
    }
  })
}

/** Re-maps existing frames onto the current placement mode/wall region
 * in place — same ids, photos, and styles, only geometry changes. Used
 * while live-dragging a wall-region corner so selection and identity
 * survive every intermediate frame of the drag. */
function remapExistingFrames(
  frames: FrameInstance[],
  layoutId: string,
  wall: WallImage,
  placementMode: PlacementMode,
  wallRegion: PerspectiveCorners | null,
): FrameInstance[] {
  const layout = getLayout(layoutId)
  return frames.map((frame) => {
    const slot = layout.slots.find((s) => s.id === frame.slotId)
    if (!slot) return frame
    const geometry = computeSlotGeometry(slot, wall, placementMode, wallRegion)
    const style = getFrameStyle(frame.styleId)
    const oldInner = computeInnerOpening(frame.width, frame.height, style)
    const newInner = computeInnerOpening(geometry.width, geometry.height, style)
    return {
      ...frame,
      ...geometry,
      photoTransform: frame.photo ? rescalePhotoTransform(frame.photoTransform, oldInner, newInner, frame.photo) : frame.photoTransform,
    }
  })
}

export const useCompositionStore = create<CompositionState>((set, get) => {
  /** Wraps a state update with an Undo/Redo checkpoint: the state *before*
   * this change goes on the past stack, and any redo stack is invalidated
   * (standard undo/redo semantics — a new action forks off the timeline). */
  const recordAndSet = (updater: (state: CompositionState) => Partial<CompositionState>) => {
    const state = get()
    const partial = updater(state)
    set({
      ...partial,
      past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
      future: [],
    })
  }

  return {
    wall: null,
    frames: [],
    activeLayoutId: DEFAULT_LAYOUT_ID,
    activeStyleId: DEFAULT_FRAME_STYLE_ID,
    hasCustomStyle: false,
    placementMode: 'free',
    wallRegion: null,
    past: [],
    future: [],

    undo: () => {
      const state = get()
      if (state.past.length === 0) return
      const previous = state.past[state.past.length - 1]
      set({
        ...previous,
        past: state.past.slice(0, -1),
        future: [...state.future, snapshotOf(state)].slice(-MAX_HISTORY),
      })
      useUIStore.getState().clearSelection()
    },

    redo: () => {
      const state = get()
      if (state.future.length === 0) return
      const next = state.future[state.future.length - 1]
      set({
        ...next,
        future: state.future.slice(0, -1),
        past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
      })
      useUIStore.getState().clearSelection()
    },

    setWall: (wall) => {
      const state = get()
      revokeIfBlobUrl(state.wall?.src)
      useUIStore.getState().clearSelection()
      set({
        wall,
        // A new photo invalidates any previously-selected wall region, and
        // starts a fresh design — the old one shouldn't be undoable back to.
        wallRegion: null,
        past: [],
        future: [],
        frames:
          state.frames.length === 0
            ? buildFramesForLayout(state.activeLayoutId, wall, [], state.activeStyleId, state.hasCustomStyle, state.placementMode, null)
            : buildFramesForLayout(state.activeLayoutId, wall, state.frames, state.activeStyleId, state.hasCustomStyle, state.placementMode, null),
      })
    },

    resetComposition: () => {
      const state = get()
      revokeIfBlobUrl(state.wall?.src)
      state.frames.forEach((frame) => revokeIfBlobUrl(frame.photo?.src))
      set({
        wall: null,
        frames: [],
        activeLayoutId: DEFAULT_LAYOUT_ID,
        activeStyleId: DEFAULT_FRAME_STYLE_ID,
        hasCustomStyle: false,
        placementMode: 'free',
        wallRegion: null,
        past: [],
        future: [],
      })
    },

    applyLayout: (layoutId) => {
      const { wall } = get()
      if (!wall) {
        set({ activeLayoutId: layoutId })
        return
      }
      useUIStore.getState().clearSelection()
      recordAndSet((state) => ({
        activeLayoutId: layoutId,
        frames: buildFramesForLayout(layoutId, wall, state.frames, state.activeStyleId, state.hasCustomStyle, state.placementMode, state.wallRegion),
      }))
    },

    setFrameStyle: (frameId, styleId) =>
      recordAndSet((state) => ({
        frames: state.frames.map((frame) => {
          if (frame.id !== frameId) return frame
          if (!frame.photo) return { ...frame, styleId }
          const oldInner = computeInnerOpening(frame.width, frame.height, getFrameStyle(frame.styleId))
          const newInner = computeInnerOpening(frame.width, frame.height, getFrameStyle(styleId))
          return { ...frame, styleId, photoTransform: rescalePhotoTransform(frame.photoTransform, oldInner, newInner, frame.photo) }
        }),
      })),

    setAllFramesStyle: (styleId) =>
      recordAndSet((state) => ({
        activeStyleId: styleId,
        hasCustomStyle: true,
        frames: state.frames.map((frame) => {
          if (!frame.photo) return { ...frame, styleId }
          const oldInner = computeInnerOpening(frame.width, frame.height, getFrameStyle(frame.styleId))
          const newInner = computeInnerOpening(frame.width, frame.height, getFrameStyle(styleId))
          return { ...frame, styleId, photoTransform: rescalePhotoTransform(frame.photoTransform, oldInner, newInner, frame.photo) }
        }),
      })),

    setFramePhoto: (frameId, photo) =>
      recordAndSet((state) => ({
        frames: state.frames.map((frame) => {
          if (frame.id !== frameId) return frame
          return {
            ...frame,
            photo,
            photoTransform: initialPhotoTransform(frame.width, frame.height, frame.styleId, photo),
          }
        }),
      })),

    updateFrameTransform: (frameId, partial) =>
      recordAndSet((state) => ({
        frames: state.frames.map((frame) => {
          if (frame.id !== frameId) return frame
          const sizeChanged =
            (partial.width !== undefined && partial.width !== frame.width) ||
            (partial.height !== undefined && partial.height !== frame.height)
          if (!sizeChanged || !frame.photo) return { ...frame, ...partial }

          const style = getFrameStyle(frame.styleId)
          const oldInner = computeInnerOpening(frame.width, frame.height, style)
          const newInner = computeInnerOpening(partial.width ?? frame.width, partial.height ?? frame.height, style)
          return {
            ...frame,
            ...partial,
            photoTransform: rescalePhotoTransform(frame.photoTransform, oldInner, newInner, frame.photo),
          }
        }),
      })),

    // Continuous adjustment (wheel-zoom, drag-pan, the zoom slider) — not a
    // history checkpoint on its own; Auto Fit / Rotate / initial placement
    // are the discrete "commit points" undo tracks for photo framing.
    //
    // Every path that can change scale/offset funnels through here, so the
    // "photo always fully covers its opening" guarantee is enforced in one
    // place: scale is floored at the true (rotation-aware) cover scale, and
    // offset is clamped to whatever pan slack that scale actually allows —
    // otherwise a wheel-zoom-out or a drag while editing can reveal a gap
    // at the opening's edge (mat/backing showing through).
    updateFramePhotoTransform: (frameId, partial) =>
      set((state) => ({
        frames: state.frames.map((frame) => {
          if (frame.id !== frameId) return frame
          const merged = { ...frame.photoTransform, ...partial }
          if (!frame.photo) return { ...frame, photoTransform: merged }

          const style = getFrameStyle(frame.styleId)
          const opening = computeInnerOpening(frame.width, frame.height, style)
          const minScale = coverScaleForRotation(opening.width, opening.height, frame.photo.width, frame.photo.height, merged.rotation)
          const scale = Math.max(merged.scale, minScale)
          const { offsetX, offsetY } = clampPhotoPan(
            merged.offsetX,
            merged.offsetY,
            scale,
            merged.rotation,
            opening.width,
            opening.height,
            frame.photo.width,
            frame.photo.height,
          )
          return { ...frame, photoTransform: { scale, offsetX, offsetY, rotation: merged.rotation } }
        }),
      })),

    autoFitPhoto: (frameId) =>
      recordAndSet((state) => ({
        frames: state.frames.map((frame) => {
          if (frame.id !== frameId || !frame.photo) return frame
          return {
            ...frame,
            photoTransform: initialPhotoTransform(frame.width, frame.height, frame.styleId, frame.photo),
          }
        }),
      })),

    rotatePhoto90: (frameId, direction) =>
      recordAndSet((state) => ({
        frames: state.frames.map((frame) => {
          if (frame.id !== frameId || !frame.photo) return frame
          const opening = computeInnerOpening(frame.width, frame.height, getFrameStyle(frame.styleId))
          const nextRotation = (frame.photoTransform.rotation + direction * 90 + 360) % 360
          const scale = coverScaleForRotation(opening.width, opening.height, frame.photo.width, frame.photo.height, nextRotation)
          return { ...frame, photoTransform: { offsetX: 0, offsetY: 0, scale, rotation: nextRotation } }
        }),
      })),

    addFrame: () => {
      const { wall } = get()
      if (!wall) return
      recordAndSet((state) => {
        const cascade = state.frames.length % 6
        const width = wall.width * 0.18
        const height = wall.height * 0.24
        const newFrame: FrameInstance = {
          id: createId('frame'),
          slotId: createId('custom-slot'),
          x: wall.width * 0.5 + cascade * wall.width * 0.02,
          y: wall.height * 0.5 + cascade * wall.height * 0.02,
          width,
          height,
          rotation: 0,
          styleId: state.activeStyleId,
          photo: null,
          photoTransform: DEFAULT_PHOTO_TRANSFORM,
        }
        return { frames: [...state.frames, newFrame] }
      })
    },

    removeFrame: (frameId) => {
      useUIStore.getState().clearSelection()
      recordAndSet((state) => ({
        frames: state.frames.filter((frame) => frame.id !== frameId),
      }))
    },

    setDefaultPerspective: (frameId) =>
      recordAndSet((state) => ({
        frames: state.frames.map((frame) =>
          frame.id === frameId ? { ...frame, perspective: computeDefaultCorners(frame) } : frame,
        ),
      })),

    clearPerspective: (frameId) =>
      recordAndSet((state) => ({
        frames: state.frames.map((frame) =>
          frame.id === frameId ? { ...frame, perspective: undefined } : frame,
        ),
      })),

    // Continuous (drag) — excluded from history, same reasoning as photo pan/zoom.
    updatePerspectiveCorner: (frameId, corner, point) =>
      set((state) => ({
        frames: state.frames.map((frame) => {
          if (frame.id !== frameId || !frame.perspective) return frame
          return { ...frame, perspective: { ...frame.perspective, [corner]: point } }
        }),
      })),

    setPlacementMode: (mode) => {
      const { wall } = get()
      if (!wall) {
        set({ placementMode: mode })
        return
      }
      recordAndSet((state) => ({
        placementMode: mode,
        frames: remapExistingFrames(state.frames, state.activeLayoutId, wall, mode, state.wallRegion),
      }))
    },

    setWallRegion: (region) => {
      const { wall } = get()
      if (!wall) {
        set({ wallRegion: region })
        return
      }
      recordAndSet((state) => ({
        wallRegion: region,
        frames: remapExistingFrames(state.frames, state.activeLayoutId, wall, state.placementMode, region),
      }))
    },

    // Continuous (drag) — excluded from history; the committed selection
    // (setWallRegion) and Redraw (resetWallRegion) are the checkpoints.
    updateWallRegionCorner: (corner, point) => {
      const { wall, activeLayoutId, placementMode, wallRegion } = get()
      if (!wallRegion) return
      const nextRegion = { ...wallRegion, [corner]: point }
      if (!wall) {
        set({ wallRegion: nextRegion })
        return
      }
      set((state) => ({
        wallRegion: nextRegion,
        frames: remapExistingFrames(state.frames, activeLayoutId, wall, placementMode, nextRegion),
      }))
    },

    resetWallRegion: () => {
      const { wall } = get()
      if (!wall) {
        set({ wallRegion: null })
        return
      }
      recordAndSet((state) => ({
        wallRegion: null,
        frames: remapExistingFrames(state.frames, state.activeLayoutId, wall, state.placementMode, null),
      }))
    },
  }
})
