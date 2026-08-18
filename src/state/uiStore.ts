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

interface UIState {
  selectedFrameId: string | null
  editingPhotoFrameId: string | null
  viewport: Viewport
  /** Developer-only mode: shows draggable perspective corner handles for the
   * selected frame. Hidden from the normal customer-facing experience. */
  perspectiveEditMode: boolean
  /** True only while the customer is clicking the four wall-surface corners
   * in "Select Wall" mode (Mode B) — before that quad is committed. */
  isSelectingWall: boolean
  /** True only for the instant a composition export is being rasterized —
   * hides all editing chrome (selection outlines, perspective/wall-region
   * handles) so the exported image shows only the physical composition. */
  isExportingPreview: boolean
  /** Developer-only alignment guide, live while perspective-editing a frame:
   * a second, independent quad the developer traces onto the wall's actual
   * visible surface in the photo, so there's something to drag the frame's
   * own corners toward. Deliberately NOT `wallRegion` (Mode B's quad) —
   * that state drives `remapExistingFrames`, which unconditionally rewrites
   * every frame's geometry (including wiping `perspective` back to
   * undefined in free-placement mode) whenever it changes; reusing it here
   * would silently destroy manually-tuned per-frame perspective corners on
   * the first drag. This is purely presentational and never touches
   * `compositionStore.frames`. */
  debugReferenceQuad: PerspectiveCorners | null

  selectFrame: (frameId: string | null) => void
  setEditingPhoto: (frameId: string | null) => void
  clearSelection: () => void
  togglePerspectiveEditMode: () => void
  startWallSelection: () => void
  stopWallSelection: () => void
  setDebugReferenceQuad: (quad: PerspectiveCorners) => void
  updateDebugReferenceQuadCorner: (corner: keyof PerspectiveCorners, point: { x: number; y: number }) => void

  /** User-driven viewport change (wheel/drag/pinch/zoom buttons). */
  setViewport: (partial: Partial<Pick<Viewport, 'scale' | 'x' | 'y'>>) => void
  /** Programmatic fit-to-viewport; leaves isCustom false so future resizes keep auto-fitting. */
  fitViewport: (viewport: Pick<Viewport, 'scale' | 'x' | 'y'>) => void

  resetUI: () => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedFrameId: null,
  editingPhotoFrameId: null,
  viewport: DEFAULT_VIEWPORT,
  perspectiveEditMode: false,
  isSelectingWall: false,
  isExportingPreview: false,
  debugReferenceQuad: null,

  // Reference quad is only meaningful for whichever frame is currently
  // being perspective-edited — clear it whenever the selection changes so a
  // newly-selected frame doesn't inherit the previous frame's guide.
  selectFrame: (frameId) =>
    set((state) => ({
      selectedFrameId: frameId,
      debugReferenceQuad: frameId === state.selectedFrameId ? state.debugReferenceQuad : null,
    })),
  togglePerspectiveEditMode: () =>
    set((state) => {
      const next = !state.perspectiveEditMode
      return { perspectiveEditMode: next, debugReferenceQuad: next ? state.debugReferenceQuad : null }
    }),
  startWallSelection: () => set({ isSelectingWall: true, selectedFrameId: null, editingPhotoFrameId: null }),
  stopWallSelection: () => set({ isSelectingWall: false }),
  // Entering edit mode (frameId set) also selects that frame. Exiting
  // (frameId null) only clears editing — the frame stays selected so its
  // crop controls remain visible.
  setEditingPhoto: (frameId) =>
    set((state) => ({
      editingPhotoFrameId: frameId,
      selectedFrameId: frameId ?? state.selectedFrameId,
    })),
  clearSelection: () => set({ selectedFrameId: null, editingPhotoFrameId: null }),
  setDebugReferenceQuad: (quad) => set({ debugReferenceQuad: quad }),
  updateDebugReferenceQuadCorner: (corner, point) =>
    set((state) => {
      if (!state.debugReferenceQuad) return state
      return { debugReferenceQuad: { ...state.debugReferenceQuad, [corner]: point } }
    }),

  setViewport: (partial) =>
    set((state) => ({ viewport: { ...state.viewport, ...partial, isCustom: true } })),
  fitViewport: (viewport) => set({ viewport: { ...viewport, isCustom: false } }),

  resetUI: () =>
    set({
      selectedFrameId: null,
      editingPhotoFrameId: null,
      viewport: DEFAULT_VIEWPORT,
      isSelectingWall: false,
      debugReferenceQuad: null,
    }),
}))
