import { useState } from 'react'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { FrameLab } from './FrameLab/FrameLab'
import { RealismLab } from './RealismLab/RealismLab'
import { PerspectiveControls } from './PerspectiveControls'

/**
 * DEVELOPMENT-ONLY tooling: the isolated frame-style lab, the realism test
 * bench, and per-frame perspective corner editing. App.tsx renders this only
 * when `import.meta.env.DEV` is true and loads it lazily, so none of it is
 * in the production bundle and none of it is reachable by a customer.
 */
export default function DevTools() {
  const [isOpen, setIsOpen] = useState(false)
  const [showFrameLab, setShowFrameLab] = useState(false)
  const [showRealismLab, setShowRealismLab] = useState(false)

  const frames = useCompositionStore((s) => s.frames)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const perspectiveEditMode = useUIStore((s) => s.perspectiveEditMode)
  const togglePerspectiveEditMode = useUIStore((s) => s.togglePerspectiveEditMode)
  const selectedFrame = frames.find((f) => f.id === selectedFrameId)

  return (
    <>
      <button
        type="button"
        className="fixed top-3 right-3 z-[70] rounded-md border border-dashed border-line-strong bg-white/80 px-2 py-[3px] text-[10.5px] font-bold tracking-[0.05em] text-ink-3 uppercase opacity-55 hover:opacity-100"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Developer tools"
      >
        Dev
      </button>

      {isOpen && (
        <div className="shadow-lift fixed top-10 right-3 z-[70] max-h-[70vh] w-[260px] overflow-y-auto rounded-xl border border-line bg-white p-3.5">
          <div className="mb-3 flex items-center justify-between text-xs font-bold tracking-[0.05em] text-ink-2 uppercase">
            <span>Developer tools</span>
            <button type="button" className="border-none bg-none px-1.5 py-0.5 text-lg leading-none text-ink-3" onClick={() => setIsOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <button type="button" className="btn btnSecondary btnCompact" onClick={() => setShowFrameLab(true)}>
              Frame Style Lab
            </button>
            <button type="button" className="btn btnSecondary btnCompact" onClick={() => setShowRealismLab(true)}>
              Realism Lab
            </button>

            <label className="mt-1.5 flex items-center gap-2 text-[12.5px] font-semibold">
              <input type="checkbox" checked={perspectiveEditMode} onChange={togglePerspectiveEditMode} />
              Perspective corner editing
            </label>
            {perspectiveEditMode && selectedFrame && <PerspectiveControls frame={selectedFrame} />}
          </div>
        </div>
      )}

      {showFrameLab && <FrameLab onClose={() => setShowFrameLab(false)} />}
      {showRealismLab && <RealismLab onClose={() => setShowRealismLab(false)} />}
    </>
  )
}
