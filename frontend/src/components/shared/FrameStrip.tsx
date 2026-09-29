import type { FrameInstance } from '../../types/frame'
import { describeFrame } from '../../lib/frameLabels'

interface FrameStripProps {
  frames: FrameInstance[]
  /** null means "all frames" when `showAll` is set. */
  selectedId: string | null
  onSelect: (frameId: string | null) => void
  showAll?: boolean
}

const chip = (active: boolean) =>
  `flex min-w-[68px] flex-col items-center gap-[5px] rounded-card border-[1.5px] pt-1.5 px-1.5 pb-[5px] transition-[border-color,background-color] duration-150 ease-in-out ${
    active ? 'border-ink bg-white text-ink shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line bg-card text-ink-2 hover:border-line-strong'
  }`

const chipThumb = 'flex h-[52px] w-[52px] items-center justify-center rounded-md bg-paper-2 bg-cover bg-center text-lg font-semibold text-ink-3'
const chipLabel = 'text-xs font-semibold whitespace-nowrap'

/**
 * A row of numbered frame chips — the customer's handle on "which frame am I
 * changing?". Tapping a frame on the wall is fiddly on a phone (and the
 * canvas isn't reachable by keyboard), so every frame is also selectable
 * from here, with a thumbnail of its photo.
 */
export function FrameStrip({ frames, selectedId, onSelect, showAll = false }: FrameStripProps) {
  return (
    <div className="scroller pb-2" role="group" aria-label="Choose a frame">
      {showAll && (
        <button type="button" className={chip(selectedId === null)} aria-pressed={selectedId === null} onClick={() => onSelect(null)}>
          <span className={chipThumb} aria-hidden>
            All
          </span>
          <span className={chipLabel}>All frames</span>
        </button>
      )}
      {frames.map((frame, index) => (
        <button
          key={frame.id}
          type="button"
          className={chip(selectedId === frame.id)}
          aria-pressed={selectedId === frame.id}
          aria-label={describeFrame(frame, index)}
          onClick={() => onSelect(frame.id)}
        >
          <span className={chipThumb} style={frame.photo ? { backgroundImage: `url("${frame.photo.src}")` } : undefined} aria-hidden>
            {!frame.photo && '+'}
          </span>
          <span className={chipLabel}>Frame {index + 1}</span>
        </button>
      ))}
    </div>
  )
}
