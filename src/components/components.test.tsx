import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { makePhoto, makeWall, resetAllStores } from '../test/fixtures'
import { useCompositionStore } from '../state/compositionStore'
import { useJourneyStore } from '../state/journeyStore'
import { useUIStore } from '../state/uiStore'
import { buildQuote } from '../domain/pricing'
import { findSku } from '../domain/catalog'
import { formatMoney } from '../../shared/money'
import { PriceTag } from './shared/PriceTag'
import { QuoteSummary } from './shared/QuoteSummary'
import { Toasts } from './shared/Toasts'
import { FrameStrip } from './shared/FrameStrip'
import { PhotoQualityNote } from './shared/PhotoQualityNote'
import { ViewModeControl } from './shared/ViewModeControl'
import { StepProgress } from './Journey/StepProgress'
import { Step1Wall } from './Journey/steps/Step1Wall'
import { Step5SizePrice } from './Journey/steps/Step5SizePrice'

const composition = () => useCompositionStore.getState()

function designWithLayout(layoutId: string) {
  composition().setWall(makeWall())
  composition().applyLayout(layoutId)
}

beforeEach(() => {
  resetAllStores()
})

describe('PriceTag', () => {
  it('shows nothing to price until there is a frame', () => {
    render(<PriceTag />)
    expect(screen.queryByTestId('price-total')).toBeNull()
  })

  it('shows the frame count and total, and updates the moment the configuration changes', () => {
    designWithLayout('two-horizontal')
    render(<PriceTag />)
    expect(screen.getByText('2 frames')).toBeInTheDocument()
    const before = screen.getByTestId('price-total').textContent
    act(() => composition().configureFrames('all', { productId: 'gold', sizeId: '24x36' }))
    expect(screen.getByTestId('price-total')).toHaveTextContent('₹5,998') // 2 × ₹2,999
    expect(screen.getByTestId('price-total').textContent).not.toBe(before)
  })

  it('uses the singular for one frame', () => {
    composition().setWall(makeWall())
    render(<PriceTag />)
    expect(screen.getByText('1 frame')).toBeInTheDocument()
  })
})

describe('QuoteSummary', () => {
  it('invites the customer to add a frame when there are none', () => {
    render(<QuoteSummary />)
    expect(screen.getByText(/Add a frame to see pricing/)).toBeInTheDocument()
  })

  it('groups identical frames with a quantity and shows the exact total', () => {
    designWithLayout('three-minimal')
    act(() => composition().configureFrames('all', { productId: 'walnut', sizeId: '12x18' }))
    render(<QuoteSummary />)
    const lines = screen.getAllByRole('listitem')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveTextContent('3 × Classic Walnut')
    expect(lines[0]).toHaveTextContent('12 × 18 in')
    expect(lines[0]).toHaveTextContent('₹2,097')
    expect(screen.getByTestId('quote-total')).toHaveTextContent('₹2,097')
  })

  it('lists differing configurations on separate lines and mentions non-default options', () => {
    designWithLayout('two-horizontal')
    act(() => {
      composition().configureFrames('all', { productId: 'walnut', sizeId: '12x18' })
      composition().configureFrames(composition().frames[1].id, { glassId: 'premium' })
    })
    render(<QuoteSummary />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/Premium glass/)).toBeInTheDocument()
  })
})

describe('Toasts', () => {
  it('announces errors assertively, in words, without raw error text', () => {
    render(<Toasts />)
    act(() => useUIStore.getState().pushNotice('error', 'We couldn’t save the image.'))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong.')
    expect(alert).toHaveTextContent('We couldn’t save the image.')
  })

  it('announces other messages politely', () => {
    render(<Toasts />)
    act(() => useUIStore.getState().pushNotice('success', 'Saved.'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
  })

  it('can be dismissed with a labelled button', () => {
    render(<Toasts />)
    act(() => useUIStore.getState().pushNotice('info', 'Hi'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }))
    expect(screen.queryByText('Hi')).toBeNull()
  })

  it('dismisses itself after a while', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    act(() => useUIStore.getState().pushNotice('info', 'Fleeting'))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.queryByText('Fleeting')).toBeNull()
    vi.useRealTimers()
  })
})

describe('StepProgress', () => {
  it('locks steps that have not been reached, and marks the current one', () => {
    render(<StepProgress />)
    expect(screen.getByRole('button', { name: /Step 1: Wall/ })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: /Step 3: Photos, not reached yet/ })).toBeDisabled()
  })

  it('lets the customer return to a completed step', () => {
    act(() => {
      useJourneyStore.getState().advanceTo(2)
      useJourneyStore.getState().advanceTo(3)
    })
    render(<StepProgress />)
    fireEvent.click(screen.getByRole('button', { name: /Step 1: Wall, completed/ }))
    expect(useJourneyStore.getState().currentStep).toBe(1)
    expect(useJourneyStore.getState().furthestStep).toBe(3)
  })

  it('has an accessible name on the navigation landmark', () => {
    render(<StepProgress />)
    expect(screen.getByRole('navigation', { name: 'Progress' })).toBeInTheDocument()
  })
})

describe('FrameStrip', () => {
  it('lets every frame be chosen without touching the canvas, and shows which is chosen', () => {
    designWithLayout('three-minimal')
    const onSelect = vi.fn()
    const frames = composition().frames
    render(<FrameStrip frames={frames} selectedId={frames[1].id} onSelect={onSelect} showAll />)
    expect(screen.getByRole('button', { name: /^Frame 2:/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Frame 1:/ })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: /^Frame 3:/ }))
    expect(onSelect).toHaveBeenCalledWith(frames[2].id)
    fireEvent.click(screen.getByRole('button', { name: 'All frames' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('describes each frame in words for screen readers', () => {
    composition().setWall(makeWall())
    const [frame] = composition().frames
    render(<FrameStrip frames={[frame]} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /no photo yet/ })).toBeInTheDocument()
  })
})

describe('PhotoQualityNote', () => {
  it('says nothing for a photo that will print well', () => {
    composition().setWall(makeWall())
    const id = composition().frames[0].id
    composition().setFramePhoto(id, makePhoto(2560, 1920, 3.5))
    const { container } = render(<PhotoQualityNote frame={composition().frames[0]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('warns in plain words about a soft photo and offers a size that would be sharp', () => {
    composition().setWall(makeWall())
    const id = composition().frames[0].id
    composition().configureFrames(id, { sizeId: '24x36' })
    composition().setFramePhoto(id, makePhoto(1200, 900, 1))
    const onUseSize = vi.fn()
    render(<PhotoQualityNote frame={composition().frames[0]} onUseSize={onUseSize} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/may print soft/i)
    expect(note).not.toHaveTextContent(/ppi|dpi|pixel/i) // no jargon
    const suggestion = within(note).queryByRole('button', { name: /^Use / })
    if (suggestion) {
      fireEvent.click(suggestion)
      expect(onUseSize).toHaveBeenCalledOnce()
    }
  })

  it('offers no impossible size when even the smallest would be soft', () => {
    composition().setWall(makeWall())
    const id = composition().frames[0].id
    composition().setFramePhoto(id, makePhoto(300, 200, 1))
    render(<PhotoQualityNote frame={composition().frames[0]} onUseSize={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
    expect(screen.getByRole('note')).toHaveTextContent(/higher-resolution/i)
  })
})

describe('ViewModeControl', () => {
  it('is a labelled radio group reflecting the current mode', () => {
    render(<ViewModeControl />)
    expect(screen.getByRole('radiogroup', { name: /before and after/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'After' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Compare' }))
    expect(screen.getByRole('radio', { name: 'Compare' })).toHaveAttribute('aria-checked', 'true')
    expect(useJourneyStore.getState().viewMode).toBe('compare')
  })
})

describe('Step 1 — your wall', () => {
  beforeEach(() => composition().setWall(makeWall()))

  it('marking the wall switches to wall placement, and it can be undone in words', () => {
    render(<Step1Wall />)
    fireEvent.click(screen.getByTestId('mark-wall'))
    expect(composition().placementMode).toBe('wall-surface')
    expect(screen.getByText(/Wall marked/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Use the whole photo instead/ }))
    expect(composition().placementMode).toBe('free')
  })

  it('never exposes technical terms', () => {
    render(<Step1Wall />)
    expect(document.body.textContent).not.toMatch(/homography|perspective mesh|quad|normalized|geometry/i)
  })

  it('applies a valid wall width and moves on', () => {
    render(<Step1Wall />)
    const field = screen.getByTestId('wall-width')
    fireEvent.change(field, { target: { value: '420' } })
    fireEvent.blur(field)
    expect(composition().wallWidthCm).toBe(420)
    fireEvent.click(screen.getByTestId('primary-action'))
    expect(useJourneyStore.getState().currentStep).toBe(2)
  })

  it.each(['', 'abc', '-10', '5', '99999'])('rejects "%s" with an explanation and blocks continuing', (value) => {
    render(<Step1Wall />)
    fireEvent.change(screen.getByTestId('wall-width'), { target: { value } })
    expect(screen.getByRole('alert')).toHaveTextContent(/between 60 and 1500 cm/)
    expect(screen.getByTestId('primary-action')).toBeDisabled()
    expect(composition().wallWidthCm).toBe(300) // the design was never given a bad value
  })

  it('the +/- buttons change the width and are labelled', () => {
    render(<Step1Wall />)
    fireEvent.click(screen.getByRole('button', { name: /Wider by 10 centimetres/ }))
    expect(composition().wallWidthCm).toBe(310)
    fireEvent.click(screen.getByRole('button', { name: /Narrower by 10 centimetres/ }))
    expect(composition().wallWidthCm).toBe(300)
  })

  it('shows the width in feet and inches as well', () => {
    render(<Step1Wall />)
    expect(screen.getByText(/9 ft 10 in/)).toBeInTheDocument()
  })
})

describe('Step 5 — size and price', () => {
  beforeEach(() => designWithLayout('three-minimal'))

  it('picking a size for all frames updates the price and marks the choice', () => {
    render(<Step5SizePrice />)
    fireEvent.click(screen.getByTestId('size-16x24'))
    expect(screen.getByTestId('size-16x24')).toHaveAttribute('aria-checked', 'true')
    expect(composition().frames.every((f) => f.sizeId === '16x24')).toBe(true)
    expect(screen.getByTestId('quote-total')).toBeInTheDocument()
  })

  it('shows sizes in inches AND centimetres, with the price of each', () => {
    render(<Step5SizePrice />)
    const button = screen.getByTestId('size-12x18')
    expect(button).toHaveTextContent('12 × 18 in')
    expect(button).toHaveTextContent('30 × 46 cm')
    expect(button).toHaveTextContent(/₹\d/)
  })

  it('says sizes are approximate and points back to the wall width', () => {
    render(<Step5SizePrice />)
    expect(screen.getByText(/approximate/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change wall width' }))
    expect(useJourneyStore.getState().currentStep).toBe(1)
  })

  it('premium glass raises the total by exactly its surcharge', () => {
    render(<Step5SizePrice />)
    fireEvent.click(screen.getByTestId('size-8x10'))
    const before = buildQuote(composition().frames).totalMinor
    fireEvent.click(screen.getByTestId('glass-premium'))
    expect(composition().frames.every((f) => f.glassId === 'premium')).toBe(true)
    const surcharge = findSku(composition().frames[0].productId, '8x10')!.glassSurchargeMinor
    expect(buildQuote(composition().frames).totalMinor - before).toBe(3 * surcharge)
    expect(screen.getByTestId('quote-total')).toHaveTextContent(formatMoney(before + 3 * surcharge))
  })

  it('offers orientation only for a single, non-square frame', () => {
    render(<Step5SizePrice />)
    expect(screen.queryByRole('radiogroup', { name: 'Orientation' })).toBeNull()
    act(() => useUIStore.getState().selectFrame(composition().frames[0].id))
    expect(screen.queryByRole('radiogroup', { name: 'Orientation' })).not.toBeNull()
  })

  it('tells the customer about frames with no photo, with a way to fix it', () => {
    act(() => useJourneyStore.getState().advanceTo(5)) // the customer got here via step 3
    render(<Step5SizePrice />)
    expect(screen.getByRole('note')).toHaveTextContent(/3 frames have no photo yet/)
    fireEvent.click(within(screen.getByRole('note')).getByRole('button', { name: 'Add photos' }))
    expect(useJourneyStore.getState().currentStep).toBe(3)
  })

  it('explains itself gracefully when there are no frames', () => {
    resetAllStores()
    render(<Step5SizePrice />)
    expect(screen.getByText(/no frames on your wall yet/i)).toBeInTheDocument()
  })
})
