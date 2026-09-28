import styles from './CanvasStage.module.css'

interface ZoomControlsProps {
  zoomPercent: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

export function ZoomControls({ zoomPercent, onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div className={styles.zoomControls} role="group" aria-label="Zoom">
      <button type="button" className={styles.zoomButton} onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <button type="button" className={styles.zoomLabel} onClick={onFit} aria-label={`Zoom ${zoomPercent} percent. Reset to fit`}>
        {zoomPercent}%
      </button>
      <button type="button" className={styles.zoomButton} onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
    </div>
  )
}
