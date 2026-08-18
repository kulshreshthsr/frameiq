import { useCompositionStore } from '../../../state/compositionStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { getLayout } from '../../../lib/layouts'
import { getFrameStyle } from '../../../lib/frameStyles'
import { StepFooterNav } from '../StepFooterNav'
import toolbarStyles from '../../Toolbar/Toolbar.module.css'
import styles from '../Journey.module.css'

interface Step5PreviewProps {
  onExport: () => void
}

export function Step5Preview({ onExport }: Step5PreviewProps) {
  const frames = useCompositionStore((s) => s.frames)
  const activeLayoutId = useCompositionStore((s) => s.activeLayoutId)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const advanceTo = useJourneyStore((s) => s.advanceTo)
  const enterFullscreenPreview = useJourneyStore((s) => s.enterFullscreenPreview)
  const showBefore = useJourneyStore((s) => s.showBefore)
  const setBeforeAfter = useJourneyStore((s) => s.setBeforeAfter)

  const layout = getLayout(activeLayoutId)
  const styleNames = [...new Set(frames.map((f) => getFrameStyle(f.styleId).name))]

  return (
    <>
      <div className={styles.content}>
        <h2 className={styles.title}>Preview your wall</h2>
        <p className={styles.hint}>
          {layout.name} · {frames.length} frame{frames.length === 1 ? '' : 's'} · {styleNames.join(', ') || 'No style yet'}
        </p>

        <div className={toolbarStyles.buttonRow}>
          <button
            type="button"
            className={!showBefore ? toolbarStyles.primaryButton : toolbarStyles.secondaryButton}
            onClick={() => setBeforeAfter(false)}
          >
            After
          </button>
          <button
            type="button"
            className={showBefore ? toolbarStyles.primaryButton : toolbarStyles.secondaryButton}
            onClick={() => setBeforeAfter(true)}
          >
            Before
          </button>
        </div>

        <button type="button" className={toolbarStyles.secondaryButton} onClick={enterFullscreenPreview}>
          View Full Screen
        </button>
        <button type="button" className={toolbarStyles.secondaryButton} onClick={onExport}>
          Save Image
        </button>
      </div>
      <StepFooterNav onBack={() => goToStep(4)} onContinue={() => advanceTo(6)} continueLabel="See estimated price" />
    </>
  )
}
