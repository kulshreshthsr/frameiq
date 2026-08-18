import { LAYOUTS, getLayout } from '../../lib/layouts'
import { useCompositionStore } from '../../state/compositionStore'
import styles from './Toolbar.module.css'

export function LayoutPicker() {
  const activeLayoutId = useCompositionStore((s) => s.activeLayoutId)
  const applyLayout = useCompositionStore((s) => s.applyLayout)
  const activeLayout = getLayout(activeLayoutId)

  return (
    <div>
      <div className={styles.grid}>
        {LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            className={`${styles.layoutSwatch} ${layout.id === activeLayoutId ? styles.active : ''}`}
            onClick={() => applyLayout(layout.id)}
            title={`${layout.name} — ${layout.description}`}
          >
            <span className={styles.layoutPreview}>
              {layout.slots.map((slot) => (
                <span
                  key={slot.id}
                  className={styles.layoutSlot}
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
            <span className={styles.layoutLabel}>{layout.name}</span>
          </button>
        ))}
      </div>
      <p className={styles.sectionHint}>{activeLayout.description}</p>
    </div>
  )
}
