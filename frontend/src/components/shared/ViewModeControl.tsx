import { useJourneyStore, type ViewMode } from '../../state/journeyStore'

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'before', label: 'Before' },
  { mode: 'compare', label: 'Compare' },
  { mode: 'after', label: 'After' },
]

interface ViewModeControlProps {
  block?: boolean
}

/** Before / Compare / After. "Compare" gives a draggable divider between the
 * original room and the framed design. */
export function ViewModeControl({ block = false }: ViewModeControlProps) {
  const viewMode = useJourneyStore((s) => s.viewMode)
  const setViewMode = useJourneyStore((s) => s.setViewMode)

  return (
    <div className={`segmented ${block ? 'segmentedBlock' : ''}`} role="radiogroup" aria-label="Compare your room before and after">
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={viewMode === option.mode}
          className={`segment ${viewMode === option.mode ? 'segmentActive' : ''}`}
          onClick={() => setViewMode(option.mode)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
