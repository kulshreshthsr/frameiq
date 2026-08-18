import { create } from 'zustand'

export const STEPS = [
  { id: 1, title: 'Upload your wall', short: 'Wall' },
  { id: 2, title: 'Choose a layout', short: 'Layout' },
  { id: 3, title: 'Add your photos', short: 'Photos' },
  { id: 4, title: 'Choose your frame', short: 'Frame' },
  { id: 5, title: 'Preview your wall', short: 'Preview' },
  { id: 6, title: 'Estimated price', short: 'Price' },
] as const

export type StepId = (typeof STEPS)[number]['id']

interface JourneyState {
  currentStep: StepId
  furthestStep: StepId
  showBefore: boolean
  isFullscreenPreview: boolean

  goToStep: (step: StepId) => void
  advanceTo: (step: StepId) => void
  toggleBeforeAfter: () => void
  setBeforeAfter: (showBefore: boolean) => void
  enterFullscreenPreview: () => void
  exitFullscreenPreview: () => void
  resetJourney: () => void
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  currentStep: 1,
  furthestStep: 1,
  showBefore: false,
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

  toggleBeforeAfter: () => set((state) => ({ showBefore: !state.showBefore })),
  setBeforeAfter: (showBefore) => set({ showBefore }),

  enterFullscreenPreview: () => set({ isFullscreenPreview: true }),
  exitFullscreenPreview: () => set({ isFullscreenPreview: false }),

  resetJourney: () => set({ currentStep: 1, furthestStep: 1, showBefore: false, isFullscreenPreview: false }),
}))
