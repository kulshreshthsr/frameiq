import { useEffect, useState } from 'react'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { useJourneyStore } from '../../state/journeyStore'
import styles from './FloatingToolbar.module.css'

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FullscreenEnterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FullscreenExitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 4v3a1 1 0 0 1-1 1H5M15 4v3a1 1 0 0 0 1 1h3M9 20v-3a1 1 0 0 0-1-1H5M15 20v-3a1 1 0 0 1 1-1h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Compact, always-available controls that sit with the canvas — not tied
 * to any single step. Undo/Redo operate on design history; Before/After
 * and Fullscreen change how the same composition is being viewed. */
export function FloatingToolbar() {
  const canUndo = useCompositionStore((s) => s.past.length > 0)
  const canRedo = useCompositionStore((s) => s.future.length > 0)
  const undo = useCompositionStore((s) => s.undo)
  const redo = useCompositionStore((s) => s.redo)
  const resetComposition = useCompositionStore((s) => s.resetComposition)
  const resetUI = useUIStore((s) => s.resetUI)
  const resetJourney = useJourneyStore((s) => s.resetJourney)

  const showBefore = useJourneyStore((s) => s.showBefore)
  const setBeforeAfter = useJourneyStore((s) => s.setBeforeAfter)
  const isFullscreenPreview = useJourneyStore((s) => s.isFullscreenPreview)
  const enterFullscreenPreview = useJourneyStore((s) => s.enterFullscreenPreview)
  const exitFullscreenPreview = useJourneyStore((s) => s.exitFullscreenPreview)

  const [confirmingReset, setConfirmingReset] = useState(false)

  useEffect(() => {
    if (!confirmingReset) return
    const timer = setTimeout(() => setConfirmingReset(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmingReset])

  const handleReset = () => {
    if (!confirmingReset) {
      setConfirmingReset(true)
      return
    }
    resetComposition()
    resetUI()
    resetJourney()
    setConfirmingReset(false)
  }

  return (
    <div className={styles.bar}>
      <div className={styles.group}>
        <button type="button" className={styles.iconButton} onClick={undo} disabled={!canUndo} title="Undo" aria-label="Undo">
          <UndoIcon />
        </button>
        <button type="button" className={styles.iconButton} onClick={redo} disabled={!canRedo} title="Redo" aria-label="Redo">
          <RedoIcon />
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.segmented} role="group" aria-label="Before and after view">
        <button
          type="button"
          className={`${styles.segment} ${showBefore ? styles.segmentActive : ''}`}
          onClick={() => setBeforeAfter(true)}
        >
          Before
        </button>
        <button
          type="button"
          className={`${styles.segment} ${!showBefore ? styles.segmentActive : ''}`}
          onClick={() => setBeforeAfter(false)}
        >
          After
        </button>
      </div>

      <div className={styles.divider} />

      <button
        type="button"
        className={styles.iconButton}
        onClick={isFullscreenPreview ? exitFullscreenPreview : enterFullscreenPreview}
        title={isFullscreenPreview ? 'Exit full screen' : 'Full-screen preview'}
        aria-label={isFullscreenPreview ? 'Exit full screen' : 'Full-screen preview'}
      >
        {isFullscreenPreview ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
      </button>

      <div className={styles.divider} />

      <button type="button" className={`${styles.textButton} ${confirmingReset ? styles.textButtonConfirm : ''}`} onClick={handleReset}>
        {confirmingReset ? 'Confirm reset?' : 'Reset design'}
      </button>
    </div>
  )
}
