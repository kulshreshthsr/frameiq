import { create } from 'zustand'
import type {
  FrameDesign,
  FrameInstance,
  PerspectiveCorners,
  PhotoAsset,
  PhotoTransform,
  SurfaceAnchor,
  WallImage,
} from '../types/frame'
import { createId } from '../lib/id'
import { DEFAULT_LAYOUT_ID, getLayout } from '../lib/layouts'
import { coverScale } from '../lib/geometry'
import { clampPhotoPan, computeInnerOpening, coverScaleForRotation, rescalePhotoTransform } from '../lib/frameGeometry'
import { computeDefaultCorners, computeDefaultWallRegion } from '../lib/perspective'
import {
  DEFAULT_PRODUCT_ID,
  defaultGlassFor,
  defaultMatFor,
  defaultSkuFor,
  findSku,
  getProduct,
  type GlassId,
  type MatId,
  type Orientation,
} from '../domain/catalog'
import { resolveFrameStyle } from '../domain/frameStyle'
import {
  DEFAULT_WALL_WIDTH_CM,
  chooseSizeForSlot,
  isSquareSku,
  nearestAvailableSku,
  sanitizeWallWidthCm,
  skuDimensionsCm,
} from '../domain/sizing'
import {
  anchorFromPixels,
  computeFrameGeometry,
  surfaceDimensionsPx,
  surfaceHeightCm,
  type PlacementMode,
  type PlacementSurface,
} from '../domain/placement'
import { reconcileAssets } from './assetLifecycle'
import { forgetOriginals } from '../order/originals'
import { useUIStore } from './uiStore'

export type { PlacementMode } from '../domain/placement'

const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 }
const MAX_HISTORY = 50
const MAX_FRAMES = 24

/** The slice of composition state Undo/Redo tracks. Deliberately excludes
 * `wall`: a new wall photo starts a fresh design, so it isn't a step you can
 * undo back through. */
interface HistorySnapshot {
  frames: FrameInstance[]
  activeLayoutId: string
  activeProductId: string
  hasCustomProduct: boolean
  placementMode: PlacementMode
  wallRegion: PerspectiveCorners | null
  wallWidthCm: number
}

/** A change to a frame's purchasable configuration. Any subset may be given. */
export interface FrameConfigPatch {
  productId?: string
  sizeId?: string
  orientation?: Orientation
  glassId?: GlassId
  matId?: MatId
}

/** Everything needed to rebuild a composition (used by draft restore). */
export interface RestorableComposition {
  wall: WallImage
  wallWidthCm: number
  frames: FrameInstance[]
  activeLayoutId: string
  activeProductId: string
  hasCustomProduct: boolean
  placementMode: PlacementMode
  wallRegion: PerspectiveCorners | null
}

/**
 * Pure render/composition data — the wall image and the frames on it. UI
 * concerns (selection, viewport, notices) live in `uiStore`, and where the
 * customer is in the flow lives in `journeyStore`.
 */
export interface CompositionState {
  wall: WallImage | null
  /** Approximate real width of the wall (or of the marked wall region). */
  wallWidthCm: number
  frames: FrameInstance[]
  activeLayoutId: string
  activeProductId: string
  /** True once the customer has explicitly picked a product for the whole
   * wall. Until then each layout's own curated default is used for new
   * frames; afterward their choice wins, so switching layouts never mixes in
   * a product they never picked. */
  hasCustomProduct: boolean

  /** 'free' places frames on the whole photo. 'wall-surface' maps the layout
   * into `wallRegion`, so it lines up with a wall photographed at an angle. */
  placementMode: PlacementMode
  wallRegion: PerspectiveCorners | null

  past: HistorySnapshot[]
  future: HistorySnapshot[]
  undo: () => void
  redo: () => void

  setWall: (wall: WallImage) => void
  resetComposition: () => void
  restoreComposition: (composition: RestorableComposition) => void

  applyLayout: (layoutId: string) => void
  /** Change product / size / orientation / options for one frame or all. */
  configureFrames: (target: string | 'all', patch: FrameConfigPatch) => void
  setFramePhoto: (frameId: string, photo: PhotoAsset) => void
  /** Free-mode move/rotate (drag on the canvas). */
  updateFrameTransform: (frameId: string, partial: { x?: number; y?: number; rotation?: number }) => void
  updateFramePhotoTransform: (frameId: string, partial: Partial<PhotoTransform>) => void
  autoFitPhoto: (frameId: string) => void
  rotatePhoto90: (frameId: string, direction: 1 | -1) => void
  addFrame: () => void
  removeFrame: (frameId: string) => void

  /** Marks the wall: drops an adjustable region onto the photo and maps the
   * layout into it. */
  markWall: () => void
  updateWallRegionCorner: (corner: keyof PerspectiveCorners, point: { x: number; y: number }) => void
  /** Back to placing frames on the whole photo. */
  clearWallRegion: () => void
  setWallWidthCm: (widthCm: number) => void

  /** Developer-only: pin one frame's own four corners. */
  setDefaultPerspective: (frameId: string) => void
  clearPerspective: (frameId: string) => void
  updatePerspectiveCorner: (
    frameId: string,
    corner: keyof PerspectiveCorners,
    point: { x: number; y: number },
  ) => void
}

// ---------------------------------------------------------------------------
// Frame materialization
// ---------------------------------------------------------------------------

function surfaceOf(
  wall: WallImage,
  placementMode: PlacementMode,
  wallRegion: PerspectiveCorners | null,
  wallWidthCm: number,
): PlacementSurface {
  return { wall, mode: placementMode, region: wallRegion, wallWidthCm }
}

function styleOf(frame: Pick<FrameDesign, 'productId' | 'matId'>) {
  return resolveFrameStyle(frame.productId, frame.matId)
}

function initialPhotoTransform(width: number, height: number, frame: Pick<FrameDesign, 'productId' | 'matId'>, photo: PhotoAsset): PhotoTransform {
  const opening = computeInnerOpening(width, height, styleOf(frame))
  const scale = coverScale(opening.width, opening.height, photo.width, photo.height)
  return { offsetX: 0, offsetY: 0, scale, rotation: 0 }
}

/**
 * The one place a customer's design becomes pixels. Given a frame's design
 * (product, size, anchor, tilt…) and the current surface it derives the
 * frame's geometry, and — if the frame already had a photo — carries the
 * customer's crop across the change: the photo is rescaled by the ratio of
 * the old and new minimum cover scales and its pan re-clamped, so a resize,
 * style swap, mat toggle, layout switch or scale change never loses a crop
 * or exposes a gap at the opening's edge.
 *
 * Every store action that can change a frame's footprint funnels through
 * here, which is what keeps that guarantee in one place.
 */
export function materializeFrame(design: FrameDesign, surface: PlacementSurface, previous: FrameInstance | null): FrameInstance {
  const product = getProduct(design.productId)
  const sku = findSku(product.id, design.sizeId) ?? nearestAvailableSku(product, design.sizeId)
  const size = skuDimensionsCm(sku, isSquareSku(sku) ? 'portrait' : design.orientation)
  const geometry = computeFrameGeometry(
    { anchor: design.anchor, tilt: design.tilt, widthCm: size.width, heightCm: size.height },
    surface,
  )

  const photo = previous?.photo ?? null
  let photoTransform = previous?.photoTransform ?? DEFAULT_PHOTO_TRANSFORM
  if (photo && previous) {
    const oldInner = computeInnerOpening(previous.width, previous.height, styleOf(previous))
    const newInner = computeInnerOpening(geometry.width, geometry.height, styleOf(design))
    photoTransform = rescalePhotoTransform(previous.photoTransform, oldInner, newInner, photo)
  }

  return { ...design, sizeId: sku.id, ...geometry, photo, photoTransform }
}

/** Re-derives every frame's geometry after the surface or scale changed. */
function reframeAll(frames: FrameInstance[], surface: PlacementSurface): FrameInstance[] {
  return frames.map((frame) => materializeFrame(frame, surface, frame))
}

/** Applies a configuration patch with the catalog's rules: sizes must exist
 * for the product, options must be offered by it, and changing product
 * resets the mat to that product's normal (so switching to a frame that ships
 * without a mat never silently adds a paid one). */
function patchDesign(frame: FrameDesign, patch: FrameConfigPatch): FrameDesign {
  const productId = getProduct(patch.productId ?? frame.productId).id
  const product = getProduct(productId)
  const productChanged = productId !== frame.productId

  const sku = nearestAvailableSku(product, patch.sizeId ?? frame.sizeId)
  const orientation = patch.orientation ?? frame.orientation

  let glassId = patch.glassId ?? frame.glassId
  if (!product.glassOptionIds.includes(glassId)) glassId = defaultGlassFor(product)

  let matId = patch.matId ?? (productChanged ? defaultMatFor(product) : frame.matId)
  if (!product.matOptionIds.includes(matId)) matId = defaultMatFor(product)

  return { ...frame, productId, sizeId: sku.id, orientation, glassId, matId }
}

/**
 * Builds the frames for a layout on the current surface. Each slot supplies a
 * centre, a tilt and a rough footprint; the footprint is converted to real
 * centimetres and matched to the nearest catalog size (see
 * chooseSizeForSlot), so the frame that appears is a real, buyable product.
 *
 * Photos are carried across by nearest-neighbour: each new slot claims the
 * closest not-yet-used previous frame that has a photo, so switching layouts
 * keeps photos near where the customer put them without re-uploading.
 */
function buildFramesForLayout(
  layoutId: string,
  surface: PlacementSurface,
  previousFrames: FrameInstance[],
  activeProductId: string,
  hasCustomProduct: boolean,
): FrameInstance[] {
  const layout = getLayout(layoutId)
  const dims = surfaceDimensionsPx(surface)
  const surfaceWidthCm = sanitizeWallWidthCm(surface.wallWidthCm)
  const surfaceHeight = dims.width > 0 ? surfaceHeightCm(surface) : surfaceWidthCm
  const used = new Set<number>()

  return layout.slots.map((slot) => {
    let bestIndex = -1
    let bestDist = Infinity
    previousFrames.forEach((frame, index) => {
      if (used.has(index) || !frame.photo) return
      const dist = (frame.anchor.xPct - slot.xPct) ** 2 + (frame.anchor.yPct - slot.yPct) ** 2
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    })
    const carried = bestIndex >= 0 ? previousFrames[bestIndex] : null
    if (bestIndex >= 0) used.add(bestIndex)

    const productId = carried?.productId ?? (hasCustomProduct ? activeProductId : layout.defaultProductId)
    const product = getProduct(productId)
    const choice = chooseSizeForSlot(product, slot.wPct * surfaceWidthCm, slot.hPct * surfaceHeight)

    const design: FrameDesign = {
      id: createId('frame'),
      slotId: slot.id,
      anchor: { xPct: slot.xPct, yPct: slot.yPct },
      tilt: slot.rotation ?? 0,
      productId: product.id,
      sizeId: choice.sku.id,
      orientation: choice.orientation,
      glassId: carried?.glassId ?? defaultGlassFor(product),
      matId: carried?.matId ?? defaultMatFor(product),
    }
    return materializeFrame(design, surface, carried)
  })
}

function snapshotOf(state: CompositionState): HistorySnapshot {
  return {
    frames: state.frames,
    activeLayoutId: state.activeLayoutId,
    activeProductId: state.activeProductId,
    hasCustomProduct: state.hasCustomProduct,
    placementMode: state.placementMode,
    wallRegion: state.wallRegion,
    wallWidthCm: state.wallWidthCm,
  }
}

function surfaceFromState(state: CompositionState, overrides: Partial<PlacementSurface> = {}): PlacementSurface | null {
  if (!state.wall) return null
  return { ...surfaceOf(state.wall, state.placementMode, state.wallRegion, state.wallWidthCm), ...overrides }
}

function mapFrame(frames: FrameInstance[], frameId: string, update: (frame: FrameInstance) => FrameInstance): FrameInstance[] {
  return frames.map((frame) => (frame.id === frameId ? update(frame) : frame))
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
    wallWidthCm: DEFAULT_WALL_WIDTH_CM,
    frames: [],
    activeLayoutId: DEFAULT_LAYOUT_ID,
    activeProductId: DEFAULT_PRODUCT_ID,
    hasCustomProduct: false,
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
      useUIStore.getState().clearSelection()
      // A new photo starts a fresh design: its own scale, no marked wall, no
      // history to undo back through. Photos already placed are kept.
      const surface = surfaceOf(wall, 'free', null, DEFAULT_WALL_WIDTH_CM)
      set({
        wall,
        wallWidthCm: DEFAULT_WALL_WIDTH_CM,
        placementMode: 'free',
        wallRegion: null,
        past: [],
        future: [],
        frames: buildFramesForLayout(state.activeLayoutId, surface, state.frames, state.activeProductId, state.hasCustomProduct),
      })
    },

    resetComposition: () => {
      set({
        wall: null,
        wallWidthCm: DEFAULT_WALL_WIDTH_CM,
        frames: [],
        activeLayoutId: DEFAULT_LAYOUT_ID,
        activeProductId: DEFAULT_PRODUCT_ID,
        hasCustomProduct: false,
        placementMode: 'free',
        wallRegion: null,
        past: [],
        future: [],
      })
    },

    restoreComposition: (composition) => {
      const surface = surfaceOf(
        composition.wall,
        composition.placementMode,
        composition.wallRegion,
        sanitizeWallWidthCm(composition.wallWidthCm),
      )
      set({
        wall: composition.wall,
        wallWidthCm: surface.wallWidthCm,
        activeLayoutId: getLayout(composition.activeLayoutId).id,
        activeProductId: getProduct(composition.activeProductId).id,
        hasCustomProduct: composition.hasCustomProduct,
        placementMode: composition.placementMode,
        wallRegion: composition.wallRegion,
        frames: reframeAll(composition.frames, surface),
        past: [],
        future: [],
      })
    },

    applyLayout: (layoutId) => {
      const state = get()
      const surface = surfaceFromState(state)
      if (!surface) {
        set({ activeLayoutId: layoutId })
        return
      }
      useUIStore.getState().clearSelection()
      recordAndSet((s) => ({
        activeLayoutId: getLayout(layoutId).id,
        frames: buildFramesForLayout(layoutId, surface, s.frames, s.activeProductId, s.hasCustomProduct),
      }))
    },

    configureFrames: (target, patch) => {
      const state = get()
      const surface = surfaceFromState(state)
      if (!surface) return
      const isAll = target === 'all'
      recordAndSet((s) => {
        const frames = s.frames.map((frame) =>
          isAll || frame.id === target ? materializeFrame(patchDesign(frame, patch), surface, frame) : frame,
        )
        const partial: Partial<CompositionState> = { frames }
        if (isAll && patch.productId) {
          partial.activeProductId = getProduct(patch.productId).id
          partial.hasCustomProduct = true
        }
        return partial
      })
    },

    setFramePhoto: (frameId, photo) =>
      recordAndSet((state) => ({
        frames: mapFrame(state.frames, frameId, (frame) => ({
          ...frame,
          photo,
          photoTransform: initialPhotoTransform(frame.width, frame.height, frame, photo),
        })),
      })),

    updateFrameTransform: (frameId, partial) => {
      const state = get()
      const surface = surfaceFromState(state)
      if (!surface || !state.wall) return
      const wall = state.wall
      recordAndSet((s) => ({
        frames: mapFrame(s.frames, frameId, (frame) => {
          const anchor: SurfaceAnchor =
            partial.x !== undefined && partial.y !== undefined ? anchorFromPixels(partial.x, partial.y, wall) : frame.anchor
          const tilt = partial.rotation ?? frame.tilt
          return materializeFrame({ ...frame, anchor, tilt }, surface, frame)
        }),
      }))
    },

    // Continuous adjustment (drag-pan, wheel/pinch-zoom, the zoom slider) —
    // not a history checkpoint on its own; Auto Fit / Rotate / initial
    // placement are the discrete "commit points" undo tracks for photo framing.
    //
    // Every path that can change scale/offset funnels through here, so the
    // "photo always fully covers its opening" guarantee is enforced in one
    // place: scale is floored at the true (rotation-aware) cover scale, and
    // offset is clamped to whatever pan slack that scale actually allows —
    // otherwise zooming out or dragging can reveal a gap at the opening's
    // edge (mat/backing showing through).
    updateFramePhotoTransform: (frameId, partial) =>
      set((state) => ({
        frames: mapFrame(state.frames, frameId, (frame) => {
          const merged = { ...frame.photoTransform, ...partial }
          if (!frame.photo) return { ...frame, photoTransform: merged }

          const opening = computeInnerOpening(frame.width, frame.height, styleOf(frame))
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
        frames: mapFrame(state.frames, frameId, (frame) =>
          frame.photo ? { ...frame, photoTransform: initialPhotoTransform(frame.width, frame.height, frame, frame.photo) } : frame,
        ),
      })),

    rotatePhoto90: (frameId, direction) =>
      recordAndSet((state) => ({
        frames: mapFrame(state.frames, frameId, (frame) => {
          if (!frame.photo) return frame
          const opening = computeInnerOpening(frame.width, frame.height, styleOf(frame))
          const nextRotation = (frame.photoTransform.rotation + direction * 90 + 360) % 360
          const scale = coverScaleForRotation(opening.width, opening.height, frame.photo.width, frame.photo.height, nextRotation)
          return { ...frame, photoTransform: { offsetX: 0, offsetY: 0, scale, rotation: nextRotation } }
        }),
      })),

    addFrame: () => {
      const state = get()
      const surface = surfaceFromState(state)
      if (!surface || state.frames.length >= MAX_FRAMES) return
      recordAndSet((s) => {
        const cascade = s.frames.length % 6
        const product = getProduct(s.activeProductId)
        const sku = defaultSkuFor(product)
        const design: FrameDesign = {
          id: createId('frame'),
          slotId: createId('custom-slot'),
          anchor: { xPct: 0.5 + cascade * 0.02, yPct: 0.5 + cascade * 0.02 },
          tilt: 0,
          productId: product.id,
          sizeId: sku.id,
          orientation: 'portrait',
          glassId: defaultGlassFor(product),
          matId: defaultMatFor(product),
        }
        return { frames: [...s.frames, materializeFrame(design, surface, null)] }
      })
    },

    removeFrame: (frameId) => {
      useUIStore.getState().clearSelection()
      recordAndSet((state) => ({
        frames: state.frames.filter((frame) => frame.id !== frameId),
      }))
    },

    markWall: () => {
      const state = get()
      if (!state.wall) return
      const region = computeDefaultWallRegion(state.wall, 0.12)
      const surface = surfaceFromState(state, { mode: 'wall-surface', region })
      if (!surface) return
      recordAndSet((s) => ({
        placementMode: 'wall-surface',
        wallRegion: region,
        frames: reframeAll(s.frames, surface),
      }))
    },

    // Continuous (drag) — excluded from history; marking the wall and
    // clearing it are the checkpoints.
    updateWallRegionCorner: (corner, point) => {
      const state = get()
      if (!state.wall || !state.wallRegion) return
      const region = { ...state.wallRegion, [corner]: point }
      const surface = surfaceFromState(state, { region })
      if (!surface) return
      set({ wallRegion: region, frames: reframeAll(state.frames, surface) })
    },

    clearWallRegion: () => {
      const state = get()
      const surface = surfaceFromState(state, { mode: 'free', region: null })
      if (!surface) return
      recordAndSet((s) => ({
        placementMode: 'free',
        wallRegion: null,
        frames: reframeAll(s.frames, surface),
      }))
    },

    setWallWidthCm: (widthCm) => {
      const state = get()
      const next = sanitizeWallWidthCm(widthCm)
      if (next === state.wallWidthCm) return
      const surface = surfaceFromState(state, { wallWidthCm: next })
      if (!surface) {
        set({ wallWidthCm: next })
        return
      }
      recordAndSet((s) => ({ wallWidthCm: next, frames: reframeAll(s.frames, surface) }))
    },

    setDefaultPerspective: (frameId) =>
      recordAndSet((state) => ({
        frames: mapFrame(state.frames, frameId, (frame) => ({ ...frame, perspective: computeDefaultCorners(frame) })),
      })),

    clearPerspective: (frameId) =>
      recordAndSet((state) => ({
        frames: mapFrame(state.frames, frameId, (frame) => ({ ...frame, perspective: undefined })),
      })),

    // Continuous (drag) — excluded from history, same reasoning as photo pan/zoom.
    updatePerspectiveCorner: (frameId, corner, point) =>
      set((state) => ({
        frames: mapFrame(state.frames, frameId, (frame) =>
          frame.perspective ? { ...frame, perspective: { ...frame.perspective, [corner]: point } } : frame,
        ),
      })),
  }
})

// Release object URLs the moment nothing (design or undo history) can show
// them any more. Only wall/history changes can drop a reference, so pan/zoom
// ticks — which only touch frame transforms — skip the scan entirely.
useCompositionStore.subscribe((state, previous) => {
  if (state.wall !== previous.wall || state.past !== previous.past || state.future !== previous.future) {
    const released = reconcileAssets(state)
    // A photo nothing can show any more no longer needs its original either.
    if (released.length > 0) void forgetOriginals(released)
  }
})
