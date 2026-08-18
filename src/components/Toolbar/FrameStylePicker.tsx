import { FRAME_STYLES } from '../../lib/frameStyles'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import styles from './Toolbar.module.css'

export function FrameStylePicker() {
  const activeStyleId = useCompositionStore((s) => s.activeStyleId)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const frames = useCompositionStore((s) => s.frames)
  const setFrameStyle = useCompositionStore((s) => s.setFrameStyle)
  const setAllFramesStyle = useCompositionStore((s) => s.setAllFramesStyle)

  const selectedFrame = frames.find((f) => f.id === selectedFrameId)
  const currentStyleId = selectedFrame?.styleId ?? activeStyleId

  const handlePick = (styleId: string) => {
    if (selectedFrameId) {
      setFrameStyle(selectedFrameId, styleId)
    } else {
      setAllFramesStyle(styleId)
    }
  }

  return (
    <div className={styles.grid}>
      {FRAME_STYLES.map((frameStyle) => (
        <button
          key={frameStyle.id}
          type="button"
          className={`${styles.styleSwatch} ${frameStyle.id === currentStyleId ? styles.active : ''}`}
          onClick={() => handlePick(frameStyle.id)}
          title={frameStyle.name}
        >
          <span
            className={styles.styleSwatchBorder}
            style={{ borderColor: frameStyle.woodColor }}
          >
            <span
              className={styles.styleSwatchMat}
              style={{ background: frameStyle.matColor ?? frameStyle.woodColor }}
            />
          </span>
          <span className={styles.layoutLabel}>{frameStyle.name}</span>
        </button>
      ))}
    </div>
  )
}
