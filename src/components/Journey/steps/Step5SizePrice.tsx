import { useCompositionStore } from '../../../state/compositionStore'
import { useUIStore } from '../../../state/uiStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { getGlassOption, getMatOption, getProduct, productShipsWithMat, type GlassId, type MatId } from '../../../domain/catalog'
import { formatMoney } from '../../../../shared/money'
import { formatSkuCm, formatSkuInches, isSquareSku, nearestAvailableSku } from '../../../domain/sizing'
import { assessFramePhoto, commonValue } from '../../../lib/frameSelection'
import { frameName } from '../../../lib/frameLabels'
import { PanelShell, StepFooter } from '../PanelShell'
import { FrameStrip } from '../../shared/FrameStrip'
import { PhotoQualityNote } from '../../shared/PhotoQualityNote'
import { QuoteSummary } from '../../shared/QuoteSummary'
import styles from '../Journey.module.css'

export function Step5SizePrice() {
  const frames = useCompositionStore((s) => s.frames)
  const wallWidthCm = useCompositionStore((s) => s.wallWidthCm)
  const configureFrames = useCompositionStore((s) => s.configureFrames)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const selectFrame = useUIStore((s) => s.selectFrame)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const advanceTo = useJourneyStore((s) => s.advanceTo)

  const selectedFrame = frames.find((f) => f.id === selectedFrameId)
  const scopeFrames = selectedFrame ? [selectedFrame] : frames
  const target = selectedFrame?.id ?? 'all'
  const scopeName = selectedFrame ? frameName(frames.indexOf(selectedFrame)) : 'all frames'

  // Sizes offered come from the product being edited. With several products
  // selected we list the first one's sizes; others get their closest match.
  const reference = scopeFrames[0]
  const product = reference ? getProduct(reference.productId) : null
  const mixedProducts = commonValue(scopeFrames, (f) => f.productId) === null
  const currentSizeId = commonValue(scopeFrames, (f) => f.sizeId)
  const currentGlass = commonValue(scopeFrames, (f) => f.glassId)
  const currentMat = commonValue(scopeFrames, (f) => f.matId)

  const referenceSku = reference && product ? nearestAvailableSku(product, reference.sizeId) : null
  const emptyFrames = frames.filter((f) => !f.photo).length
  const softPhotos = frames.filter((f) => {
    const assessment = assessFramePhoto(f)
    return assessment !== null && assessment.quality !== 'good'
  }).length

  const leave = (action: () => void) => {
    selectFrame(null)
    action()
  }

  if (!reference || !product || !referenceSku) {
    return (
      <PanelShell
        step={5}
        title="Size & price"
        backLabel="Frames"
        onBack={() => leave(() => goToStep(4))}
        footer={<StepFooter primaryLabel="Preview on your wall" onPrimary={() => leave(() => advanceTo(6))} />}
      >
        <p className="hint">There are no frames on your wall yet. Go back and choose a layout.</p>
      </PanelShell>
    )
  }

  return (
    <PanelShell
      step={5}
      title="Size & price"
      subtitle={`Sizes are drawn to scale for a wall about ${Math.round(wallWidthCm)} cm wide.`}
      backLabel="Frames"
      onBack={() => leave(() => goToStep(4))}
      footer={<StepFooter primaryLabel="Preview on your wall" onPrimary={() => leave(() => advanceTo(6))} />}
    >
      <div className={styles.stack}>
        <FrameStrip frames={frames} selectedId={selectedFrameId} onSelect={selectFrame} showAll />

        <section className={styles.section} aria-labelledby="size-heading">
          <h3 id="size-heading" className={styles.sectionTitle}>
            Size <span className={styles.sectionScope}>· {scopeName}</span>
          </h3>
          <div className={styles.sizeGrid} role="radiogroup" aria-label={`Size for ${scopeName}`}>
            {product.sizes.map((sku) => {
              const isActive = sku.id === currentSizeId
              const orientation = selectedFrame && !isSquareSku(sku) ? selectedFrame.orientation : 'portrait'
              return (
                <button
                  key={sku.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`${styles.sizeButton} ${isActive ? styles.cardActive : ''}`}
                  onClick={() => configureFrames(target, { sizeId: sku.id })}
                  data-testid={`size-${sku.id}`}
                >
                  <span className={styles.sizeMain}>{formatSkuInches(sku, orientation)}</span>
                  <span className={styles.sizeSub}>{formatSkuCm(sku, orientation)}</span>
                  <span className={styles.sizePrice}>{formatMoney(sku.priceMinor)}</span>
                </button>
              )
            })}
          </div>
          {mixedProducts && (
            <p className={styles.hint}>Sizes shown for {product.name}. Your other frames get their closest matching size.</p>
          )}
          {selectedFrame && !isSquareSku(referenceSku) && (
            <div className={styles.inlineField}>
              <span className={styles.fieldLabel}>Direction</span>
              <div className="segmented" role="radiogroup" aria-label="Orientation">
                {(['portrait', 'landscape'] as const).map((orientation) => (
                  <button
                    key={orientation}
                    type="button"
                    role="radio"
                    aria-checked={selectedFrame.orientation === orientation}
                    className={`segment ${selectedFrame.orientation === orientation ? 'segmentActive' : ''}`}
                    onClick={() => configureFrames(selectedFrame.id, { orientation })}
                  >
                    {orientation === 'portrait' ? 'Portrait' : 'Landscape'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className={styles.section} aria-labelledby="options-heading">
          <h3 id="options-heading" className={styles.sectionTitle}>
            Finish <span className={styles.sectionScope}>· {scopeName}</span>
          </h3>

          <div className={styles.inlineField}>
            <span className={styles.fieldLabel}>Glass</span>
            <div className="segmented" role="radiogroup" aria-label="Glass">
              {product.glassOptionIds.map((glassId: GlassId) => (
                <button
                  key={glassId}
                  type="button"
                  role="radio"
                  aria-checked={currentGlass === glassId}
                  className={`segment ${currentGlass === glassId ? 'segmentActive' : ''}`}
                  onClick={() => configureFrames(target, { glassId })}
                  data-testid={`glass-${glassId}`}
                >
                  {getGlassOption(glassId).name}
                  {getGlassOption(glassId).priced && ` +${formatMoney(referenceSku.glassSurchargeMinor)}`}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.inlineField}>
            <span className={styles.fieldLabel}>Mat</span>
            <div className="segmented" role="radiogroup" aria-label="Mat">
              {product.matOptionIds.map((matId: MatId) => (
                <button
                  key={matId}
                  type="button"
                  role="radio"
                  aria-checked={currentMat === matId}
                  className={`segment ${currentMat === matId ? 'segmentActive' : ''}`}
                  onClick={() => configureFrames(target, { matId })}
                  data-testid={`mat-${matId}`}
                >
                  {getMatOption(matId).name}
                  {getMatOption(matId).hasMat && !productShipsWithMat(product) && ` +${formatMoney(referenceSku.matSurchargeMinor)}`}
                </button>
              ))}
            </div>
          </div>
        </section>

        {selectedFrame ? (
          <PhotoQualityNote frame={selectedFrame} onUseSize={(sizeId) => configureFrames(selectedFrame.id, { sizeId })} />
        ) : (
          softPhotos > 0 && (
            <p className={styles.noteBox} role="note">
              {softPhotos} photo{softPhotos === 1 ? '' : 's'} may print a little soft at these sizes. Select a frame to see options.
            </p>
          )
        )}

        {emptyFrames > 0 && (
          <p className={styles.noteBox} role="note">
            {emptyFrames} frame{emptyFrames === 1 ? ' has' : 's have'} no photo yet.{' '}
            <button type="button" className="btnText" onClick={() => leave(() => goToStep(3))}>
              Add photos
            </button>
          </p>
        )}

        <section className={styles.section} aria-labelledby="design-heading">
          <h3 id="design-heading" className={styles.sectionTitle}>
            Your design
          </h3>
          <QuoteSummary />
          <p className={styles.fineprint}>
            Prices are estimates for the frames only; delivery isn’t included. Sizes are approximate — based on the wall width you gave.{' '}
            <button type="button" className="btnText" onClick={() => leave(() => goToStep(1))}>
              Change wall width
            </button>
          </p>
        </section>
      </div>
    </PanelShell>
  )
}
