import { LAYOUTS, getLayout } from '../../../lib/layouts'
import { useCompositionStore } from '../../../state/compositionStore'
import { useJourneyStore } from '../../../state/journeyStore'
import { PanelShell, StepFooter } from '../PanelShell'
import * as js from '../journeyStyles'

export function Step2Layout() {
  const activeLayoutId = useCompositionStore((s) => s.activeLayoutId)
  const applyLayout = useCompositionStore((s) => s.applyLayout)
  const advanceTo = useJourneyStore((s) => s.advanceTo)
  const goToStep = useJourneyStore((s) => s.goToStep)
  const active = getLayout(activeLayoutId)

  return (
    <PanelShell
      step={2}
      title="Choose a layout"
      subtitle="How your frames are arranged. You can always change it later."
      backLabel="Your wall"
      onBack={() => goToStep(1)}
      footer={<StepFooter primaryLabel="Add your photos" onPrimary={() => advanceTo(3)} />}
    >
      <div className={`scroller ${js.layoutList}`} role="radiogroup" aria-label="Layouts">
        {LAYOUTS.map((layout) => {
          const isActive = layout.id === activeLayoutId
          return (
            <button key={layout.id} type="button" role="radio" aria-checked={isActive} className={js.cardState(js.layoutCard, isActive)} onClick={() => applyLayout(layout.id)} data-testid={`layout-${layout.id}`}>
              <span className={js.layoutPreview} aria-hidden>
                {layout.slots.map((slot) => (
                  <span
                    key={slot.id}
                    className={js.layoutSlot}
                    style={{
                      left: `${(slot.xPct - slot.wPct / 2) * 100}%`,
                      top: `${(slot.yPct - slot.hPct / 2) * 100}%`,
                      width: `${slot.wPct * 100}%`,
                      height: `${slot.hPct * 100}%`,
                      transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                    }}
                  />
                ))}
              </span>
              <span className={js.cardName}>{layout.name}</span>
              <span className={js.cardMeta}>
                {layout.slots.length} frame{layout.slots.length === 1 ? '' : 's'}
              </span>
            </button>
          )
        })}
      </div>
      <p className={js.hint} aria-live="polite">
        {active.description}
      </p>
    </PanelShell>
  )
}
