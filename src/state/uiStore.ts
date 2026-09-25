import { create } from 'zustand'
import type { PerspectiveCorners } from '../types/frame'

export interface Viewport {
  scale: number
  x: number
  y: number
  /** False while the view is auto-fit to the container; true once the user
   * has manually zoomed/panned, so resizes stop overriding their framing. */
  isCustom: boolean
}

const DEFAULT_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0, isCustom: false }

/** A short, customer-facing message (never a raw error). */
export interface Notice {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
}

let nextNoticeId = 1

interface UIState {
  selectedFrameId: string | null
  /** The frame whose photo is open in the crop editor, if any. */
  cropEditorFrameId: string | null
  viewport: Viewport
  /** Developer-only mode (dev builds): shows draggable perspective corner
   * handles for the selected frame. Never reachable in a production build. */
  perspectiveEditMode: boolean
  /** True only for the instant a composition export is being rasterized —
   * hides all editing chrome (selection outlines, wall handles, the empty-frame
   * "+" hint) so the exported image shows only the physical composition. */
  isExportingPreview: boolean
  /** Developer-only alignment guide, live while perspective-editing a frame.
   * Deliberately NOT the customer's wall region: that drives every frame's
   * geometry, while this is purely presentational. */
  debugReferenceQuad: PerspectiveCorners | null
  notices: Notice[]

  selectFrame: (frameId: string | null) => void
  openCropEditor: (frameId: string) => void
  closeCropEditor: () => void
  clearSelection: () => void
  togglePerspectiveEditMode: () => void
  setDebugReferenceQuad: (quad: PerspectiveCorners) => void
  updateDebugReferenceQuadCorner: (corner: keyof PerspectiveCorners, point: { x: number; y: number }) => void
  pushNotice: (kind: Notice['kind'], message: string) => void
  dismissNotice: (id: number) => void

  /** User-driven viewport change (wheel/drag/pinch/zoom buttons). */
  setViewport: (partial: Partial<Pick<Viewport, 'scale' | 'x' | 'y'>>) => void
  /** Programmatic fit-to-viewport; leaves isCustom false so future resizes keep auto-fitting. */
  fitViewport: (viewport: Pick<Viewport, 'scale' | 'x' | 'y'>) => void

  resetUI: () => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedFrameId: null,
  cropEditorFrameId: null,
  viewport: DEFAULT_VIEWPORT,
  perspectiveEditMode: false,
  isExportingPreview: false,
  debugReferenceQuad: null,
  notices: [],

  // The reference quad is only meaningful for whichever frame is being
  // perspective-edited — clear it when the selection changes.
  selectFrame: (frameId) =>
    set((state) => ({
      selectedFrameId: frameId,
      debugReferenceQuad: frameId === state.selectedFrameId ? state.debugReferenceQuad : null,
    })),
  openCropEditor: (frameId) => set({ cropEditorFrameId: frameId, selectedFrameId: frameId }),
  closeCropEditor: () => set({ cropEditorFrameId: null }),
  clearSelection: () => set({ selectedFrameId: null, cropEditorFrameId: null }),
  togglePerspectiveEditMode: () =>
    set((state) => {
      const next = !state.perspectiveEditMode
      return { perspectiveEditMode: next, debugReferenceQuad: next ? state.debugReferenceQuad : null }
    }),
  setDebugReferenceQuad: (quad) => set({ debugReferenceQuad: quad }),
  updateDebugReferenceQuadCorner: (corner, point) =>
    set((state) => {
      if (!state.debugReferenceQuad) return state
      return { debugReferenceQuad: { ...state.debugReferenceQuad, [corner]: point } }
    }),

  // A repeat of the same message replaces the old one instead of stacking.
  pushNotice: (kind, message) =>
    set((state) => ({
      notices: [...state.notices.filter((n) => n.message !== message), { id: nextNoticeId++, kind, message }].slice(-3),
    })),
  dismissNotice: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),

  setViewport: (partial) =>
    set((state) => ({ viewport: { ...state.viewport, ...partial, isCustom: true } })),
  fitViewport: (viewport) => set({ viewport: { ...viewport, isCustom: false } }),

  resetUI: () =>
    set({
      selectedFrameId: null,
      cropEditorFrameId: null,
      viewport: DEFAULT_VIEWPORT,
      debugReferenceQuad: null,
    }),
}))
