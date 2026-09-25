import { useCompositionStore } from '../../../state/compositionStore'
import { useUIStore } from '../../../state/uiStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { activeProducts, defaultMatFor, startingPriceMinor, type FrameProduct } from '../../../domain/catalog'
import { formatMoney } from '../../../../shared/money'
import { nearestAvailableSku } from '../../../domain/sizing'
import { commonValue } from '../../../lib/frameSelection'
import { frameName } from '../../../lib/frameLabels'
import type { FrameInstance } from '../../../types/frame'
import { PanelShell, StepFooter } from '../PanelShell'
import { FrameStrip } from '../../shared/FrameStrip'
import { FrameSwatch } from '../../shared/FrameSwatch'
import styles from '../Journey.module.css'

/** What to show under a style's name: its price at the selected frame's size,
 * or a "from" price when the choice covers the whole wall. */
function priceLabel(product: FrameProduct, selectedFrame: FrameInstance | undefined): string {
  if (selectedFrame) return formatMoney(nearestAvailableSku(product, selectedFrame.sizeId).priceMinor)
  return `From ${formatMoney(startingPriceMinor(product))}`
}

export function Step4Frames() {
  const frames = useCompositionStore((s) => s.frames)
  const configureFrames = useCompositionStore((s) => s.configureFrames)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const selectFrame = useUIStore((s) => s.selectFrame)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const advanceTo = useJourneyStore((s) => s.advanceTo)

  const selectedFrame = frames.find((f) => f.id === selectedFrameId)
  const scopeFrames = selectedFrame ? [selectedFrame] : frames
  const currentProductId = commonValue(scopeFrames, (f) => f.productId)
  // Show the customer's own photo in every option, so they're choosing between
  // how THEIR picture looks in each frame.
  const previewPhoto = selectedFrame?.photo ?? frames.find((f) => f.photo)?.photo ?? null

  const scopeText = selectedFrame ? `Applies to ${frameName(frames.indexOf(selectedFrame))} only.` : 'Applies to all your frames.'

  const leave = (action: () => void) => {
    selectFrame(null)
    action()
  }

  return (
    <PanelShell
      step={4}
      title="Choose your frames"
      subtitle="Pick a frame for the whole wall, or select one frame to style it on its own."
      backLabel="Photos"
      onBack={() => leave(() => goToStep(3))}
      footer={<StepFooter primaryLabel="Choose size" onPrimary={() => leave(() => advanceTo(5))} />}
    >
      <div className={styles.stack}>
        <FrameStrip frames={frames} selectedId={selectedFrameId} onSelect={selectFrame} showAll />
        <p className={styles.hint} aria-live="polite">
          {scopeText}
        </p>

        <div className={`scroller ${styles.productList}`} role="radiogroup" aria-label="Frame styles">
          {activeProducts().map((product) => {
            const isActive = product.id === currentProductId
            return (
              <button
                key={product.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={`${product.name}. ${product.tagline}. ${priceLabel(product, selectedFrame)}`}
                className={`${styles.productCard} ${isActive ? styles.cardActive : ''}`}
                onClick={() => configureFrames(selectedFrame?.id ?? 'all', { productId: product.id })}
                data-testid={`product-${product.id}`}
              >
                <span className={styles.productSwatch}>
                  <FrameSwatch productId={product.id} matId={defaultMatFor(product)} photo={previewPhoto} />
                </span>
                <span className={styles.cardName}>{product.name}</span>
                <span className={styles.cardMeta}>{priceLabel(product, selectedFrame)}</span>
              </button>
            )
          })}
        </div>
        {currentProductId === null && <p className={styles.hint}>Your frames currently use different styles. Pick one to match them all.</p>}
      </div>
    </PanelShell>
  )
}
