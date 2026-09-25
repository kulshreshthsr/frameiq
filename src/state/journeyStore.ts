import { create } from 'zustand'

export const STEPS = [
  { id: 1, title: 'Your wall', short: 'Wall' },
  { id: 2, title: 'Choose a layout', short: 'Layout' },
  { id: 3, title: 'Add your photos', short: 'Photos' },
  { id: 4, title: 'Choose your frames', short: 'Frames' },
  { id: 5, title: 'Size & price', short: 'Size & price' },
  { id: 6, title: 'Preview on your wall', short: 'Preview' },
] as const

export type StepId = (typeof STEPS)[number]['id']

/** How the room photo and the framed design are being compared. */
export type ViewMode = 'after' | 'compare' | 'before'

/** Fraction of the wall image (from the left) that shows the ORIGINAL room.
 * 0 = the finished design everywhere, 1 = the original everywhere, anything
 * between = a draggable divider with "before" on the left. */
const FRACTION_FOR_MODE: Record<ViewMode, number> = { after: 0, compare: 0.5, before: 1 }

const ANIMATION_MS = 380

interface JourneyState {
  currentStep: StepId
  furthestStep: StepId
  viewMode: ViewMode
  /** Position of the before/after divider, 0..1 (see FRACTION_FOR_MODE). */
  compareFraction: number
  isFullscreenPreview: boolean

  goToStep: (step: StepId) => void
  advanceTo: (step: StepId) => void
  restoreProgress: (current: StepId, furthest: StepId) => void
  setViewMode: (mode: ViewMode) => void
  /** Drag the divider directly. Switches to compare mode. */
  setCompareFraction: (fraction: number) => void
  /** Snap straight to the finished design (used before export). */
  showAfterImmediately: () => void
  enterFullscreenPreview: () => void
  exitFullscreenPreview: () => void
  resetJourney: () => void
}

let animationHandle: number | null = null

function cancelAnimation() {
  if (animationHandle !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(animationHandle)
  animationHandle = null
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export const useJourneyStore = create<JourneyState>((set, get) => {
  /** Slides the divider to `target` — a short, quiet sweep rather than a
   * hard cut, so the change reads as "your room, then your room framed". */
  const animateFractionTo = (target: number) => {
    cancelAnimation()
    const from = get().compareFraction
    if (from === target || typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
      set({ compareFraction: target })
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATION_MS)
      set({ compareFraction: from + (target - from) * easeInOut(t) })
      animationHandle = t < 1 ? requestAnimationFrame(step) : null
    }
    animationHandle = requestAnimationFrame(step)
  }

  return {
    currentStep: 1,
    furthestStep: 1,
    viewMode: 'after',
    compareFraction: 0,
    isFullscreenPreview: false,

    // Jumps to any already-reached step (clicking a completed step in the
    // progress indicator) — never unlocks steps ahead of furthestStep.
    goToStep: (step) => {
      if (step > get().furthestStep) return
      set({ currentStep: step })
    },

    // Moves forward, extending furthestStep as needed — used by each step's
    // "Continue" action.
    advanceTo: (step) =>
      set((state) => ({ currentStep: step, furthestStep: (Math.max(state.furthestStep, step) as StepId) })),

    restoreProgress: (current, furthest) => {
      const safeFurthest = Math.max(1, Math.min(6, furthest)) as StepId
      const safeCurrent = Math.max(1, Math.min(safeFurthest, current)) as StepId
      set({ currentStep: safeCurrent, furthestStep: safeFurthest })
    },

    setViewMode: (mode) => {
      set({ viewMode: mode })
      animateFractionTo(FRACTION_FOR_MODE[mode])
    },

    setCompareFraction: (fraction) => {
      cancelAnimation()
      set({ viewMode: 'compare', compareFraction: Math.min(1, Math.max(0, fraction)) })
    },

    showAfterImmediately: () => {
      cancelAnimation()
      set({ viewMode: 'after', compareFraction: 0 })
    },

    enterFullscreenPreview: () => set({ isFullscreenPreview: true }),
    exitFullscreenPreview: () => set({ isFullscreenPreview: false }),

    resetJourney: () => {
      cancelAnimation()
      set({ currentStep: 1, furthestStep: 1, viewMode: 'after', compareFraction: 0, isFullscreenPreview: false })
    },
  }
})
