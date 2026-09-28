import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores } from '../test/fixtures'
import { useJourneyStore } from './journeyStore'
import { useUIStore } from './uiStore'

beforeEach(() => {
  resetAllStores()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('journey steps', () => {
  const journey = () => useJourneyStore.getState()

  it('starts at step 1 with only step 1 reached', () => {
    expect(journey().currentStep).toBe(1)
    expect(journey().furthestStep).toBe(1)
  })

  it('cannot jump ahead of the furthest step reached', () => {
    journey().goToStep(4)
    expect(journey().currentStep).toBe(1)
  })

  it('advancing extends how far the customer has been, and going back keeps it', () => {
    journey().advanceTo(2)
    journey().advanceTo(3)
    journey().goToStep(1)
    expect(journey().currentStep).toBe(1)
    expect(journey().furthestStep).toBe(3)
    journey().goToStep(3) // revisit anything already reached
    expect(journey().currentStep).toBe(3)
  })

  it('going back and continuing again never shrinks progress', () => {
    journey().advanceTo(5)
    journey().goToStep(2)
    journey().advanceTo(3)
    expect(journey().furthestStep).toBe(5)
  })

  it('clamps restored progress into a valid, consistent range', () => {
    journey().restoreProgress(99 as never, 4)
    expect(journey().furthestStep).toBe(4)
    expect(journey().currentStep).toBeLessThanOrEqual(4)
    journey().restoreProgress(0 as never, -5 as never)
    expect(journey().furthestStep).toBe(1)
    expect(journey().currentStep).toBe(1)
  })

  it('resetting returns to the beginning', () => {
    journey().advanceTo(5)
    journey().enterFullscreenPreview()
    journey().resetJourney()
    expect(journey()).toMatchObject({ currentStep: 1, furthestStep: 1, isFullscreenPreview: false, viewMode: 'after', compareFraction: 0 })
  })
})

describe('before / after', () => {
  const journey = () => useJourneyStore.getState()

  it('dragging the divider switches to compare and clamps to the photo', () => {
    journey().setCompareFraction(0.4)
    expect(journey()).toMatchObject({ viewMode: 'compare', compareFraction: 0.4 })
    journey().setCompareFraction(7)
    expect(journey().compareFraction).toBe(1)
    journey().setCompareFraction(-2)
    expect(journey().compareFraction).toBe(0)
  })

  it('slides smoothly to each mode rather than cutting', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    journey().setViewMode('before')
    expect(journey().viewMode).toBe('before')
    vi.advanceTimersByTime(80)
    const midway = journey().compareFraction
    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(1)
    vi.advanceTimersByTime(600)
    expect(journey().compareFraction).toBe(1)
    journey().setViewMode('after')
    vi.advanceTimersByTime(600)
    expect(journey().compareFraction).toBe(0)
  })

  it('a new choice interrupts one still animating', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    journey().setViewMode('before')
    vi.advanceTimersByTime(100)
    journey().setViewMode('after')
    vi.advanceTimersByTime(600)
    expect(journey().compareFraction).toBe(0)
  })

  it('showAfterImmediately snaps to the finished design (used before export)', () => {
    journey().setViewMode('before')
    journey().showAfterImmediately()
    expect(journey()).toMatchObject({ viewMode: 'after', compareFraction: 0 })
  })

  it('skips the animation for people who ask for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    journey().setViewMode('before')
    expect(journey().compareFraction).toBe(1)
    vi.unstubAllGlobals()
  })
})

describe('customer notices', () => {
  const ui = () => useUIStore.getState()

  it('shows a message and lets it be dismissed', () => {
    ui().pushNotice('info', 'Hello')
    expect(ui().notices).toHaveLength(1)
    ui().dismissNotice(ui().notices[0].id)
    expect(ui().notices).toHaveLength(0)
  })

  it('repeating the same message replaces it rather than stacking', () => {
    ui().pushNotice('error', 'Same')
    ui().pushNotice('error', 'Same')
    ui().pushNotice('error', 'Same')
    expect(ui().notices).toHaveLength(1)
  })

  it('never shows more than three at once', () => {
    for (let i = 0; i < 8; i++) ui().pushNotice('info', `Message ${i}`)
    expect(ui().notices).toHaveLength(3)
    expect(ui().notices.at(-1)?.message).toBe('Message 7')
  })
})

describe('selection and viewport', () => {
  const ui = () => useUIStore.getState()

  it('opening the crop editor selects that frame; clearing removes both', () => {
    ui().openCropEditor('frame-1')
    expect(ui()).toMatchObject({ cropEditorFrameId: 'frame-1', selectedFrameId: 'frame-1' })
    ui().clearSelection()
    expect(ui()).toMatchObject({ cropEditorFrameId: null, selectedFrameId: null })
  })

  it('a manual zoom stops auto-fit; a programmatic fit resumes it', () => {
    ui().setViewport({ scale: 2 })
    expect(ui().viewport.isCustom).toBe(true)
    ui().fitViewport({ scale: 1, x: 0, y: 0 })
    expect(ui().viewport.isCustom).toBe(false)
  })
})
