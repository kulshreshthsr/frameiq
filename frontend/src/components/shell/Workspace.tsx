import { Suspense, forwardRef } from 'react'
import { CanvasStage, type CanvasStageHandle } from '../CanvasStage/CanvasStage'
import { CropEditor } from '../CropEditor/CropEditor'
import { StepPanel } from '../Journey/StepPanel'
import { ViewModeControl } from '../shared/ViewModeControl'
import { useJourneyStore } from '../../state/journeyStore'

interface WorkspaceProps {
  onExport: () => void
  isExporting: boolean
  onOrder: () => void
  isPreparingOrder: boolean
}

/**
 * The editor itself: the wall canvas beside (or above) the step panel, plus
 * the crop editor. Everything that needs Konva lives under here, so App can
 * load it as one lazy chunk — the landing screen never pays for it.
 */
const Workspace = forwardRef<CanvasStageHandle, WorkspaceProps>(function Workspace({ onExport, isExporting, onOrder, isPreparingOrder }, ref) {
  const isFullscreenPreview = useJourneyStore((s) => s.isFullscreenPreview)
  const exitFullscreenPreview = useJourneyStore((s) => s.exitFullscreenPreview)

  return (
    <>
      <main className="workspace">
        <div className="canvasArea">
          <Suspense fallback={<div className="canvasLoading" role="status">Loading your wall…</div>}>
            <CanvasStage ref={ref} />
          </Suspense>

          {isFullscreenPreview && (
            <>
              <button type="button" className="btn btnSecondary exitFullscreen" onClick={exitFullscreenPreview} data-testid="exit-fullscreen">
                Close preview
              </button>
              <div className="fullscreenControls">
                <ViewModeControl />
              </div>
            </>
          )}
        </div>

        {!isFullscreenPreview && <StepPanel onExport={onExport} isExporting={isExporting} onOrder={onOrder} isPreparingOrder={isPreparingOrder} />}
      </main>
      <CropEditor />
    </>
  )
})

export default Workspace
