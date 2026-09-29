interface ZoomControlsProps {
  zoomPercent: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

export function ZoomControls({ zoomPercent, onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div
      className="border-line shadow-soft rounded-card absolute right-3 bottom-3 flex items-stretch overflow-hidden border bg-card max-[999px]:right-2 max-[999px]:bottom-2"
      role="group"
      aria-label="Zoom"
    >
      <button
        type="button"
        className="h-10 w-10 border-none bg-transparent text-xl leading-none text-ink transition-colors duration-[120ms] ease-in-out hover:bg-paper-2 max-[999px]:h-11 max-[999px]:w-11"
        onClick={onZoomOut}
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        className="border-line text-ink-2 min-w-14 border-x bg-transparent text-[13px] font-semibold transition-colors duration-[120ms] ease-in-out hover:bg-paper-2"
        onClick={onFit}
        aria-label={`Zoom ${zoomPercent} percent. Reset to fit`}
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        className="h-10 w-10 border-none bg-transparent text-xl leading-none text-ink transition-colors duration-[120ms] ease-in-out hover:bg-paper-2 max-[999px]:h-11 max-[999px]:w-11"
        onClick={onZoomIn}
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  )
}
