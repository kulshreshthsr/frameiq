import { useCompositionStore } from '../../../state/compositionStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { PanelShell, StepFooter } from '../PanelShell'
import { QuoteSummary } from '../../shared/QuoteSummary'
import { ViewModeControl } from '../../shared/ViewModeControl'
import styles from '../Journey.module.css'

interface Step6PreviewProps {
  /** Save the image to the device. */
  onExport: () => void
  isExporting: boolean
  /** Freeze the design and begin ordering. */
  onOrder: () => void
  isPreparingOrder: boolean
}

export function Step6Preview({ onExport, isExporting, onOrder, isPreparingOrder }: Step6PreviewProps) {
  const frames = useCompositionStore((s) => s.frames)
  const viewMode = useJourneyStore((s) => s.viewMode)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const enterFullscreenPreview = useJourneyStore((s) => s.enterFullscreenPreview)

  const emptyFrames = frames.filter((f) => !f.photo).length

  return (
    <PanelShell
      step={6}
      title="Preview on your wall"
      subtitle="See your room before and after — then order when it looks right."
      backLabel="Size & price"
      onBack={() => goToStep(5)}
      footer={
        <StepFooter
          primaryLabel={isPreparingOrder ? 'Preparing…' : 'Continue to order'}
          onPrimary={onOrder}
          primaryDisabled={isPreparingOrder || frames.length === 0}
        />
      }
    >
      <div className={styles.stack}>
        <section className={styles.section} aria-labelledby="compare-heading">
          <h3 id="compare-heading" className="srOnly">
            Compare
          </h3>
          <ViewModeControl block />
          {viewMode === 'compare' && <p className={styles.hint}>Drag the handle on your photo to slide between before and after.</p>}
        </section>

        <div className={styles.buttonRow}>
          <button type="button" className="btn btnSecondary btnCompact" onClick={enterFullscreenPreview} data-testid="fullscreen">
            View full screen
          </button>
          <button type="button" className="btn btnSecondary btnCompact" onClick={onExport} disabled={isExporting} data-testid="save-image">
            {isExporting ? 'Saving…' : 'Save image'}
          </button>
        </div>

        {emptyFrames > 0 && (
          <p className={styles.noteBox} role="note">
            {emptyFrames} frame{emptyFrames === 1 ? ' has' : 's have'} no photo yet — {emptyFrames === 1 ? 'it' : 'they'}’ll be made empty.{' '}
            <button type="button" className="btnText" onClick={() => goToStep(3)}>
              Add photos
            </button>
          </p>
        )}

        <section className={styles.section} aria-labelledby="summary-heading">
          <h3 id="summary-heading" className={styles.sectionTitle}>
            Your design
          </h3>
          <QuoteSummary />
          <p className={styles.fineprint}>Colours and sizes on screen are approximate. You’ll see delivery and the final total before you pay.</p>
        </section>
      </div>
    </PanelShell>
  )
}
