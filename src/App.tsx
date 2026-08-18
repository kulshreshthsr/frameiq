import { useRef } from 'react'
import { CanvasStage, type CanvasStageHandle } from './components/CanvasStage/CanvasStage'
import { useCompositionStore } from './state/compositionStore'
import { useJourneyStore } from './state/journeyStore'
import { StepProgress } from './components/Journey/StepProgress'
import { StepPanel } from './components/Journey/StepPanel'
import { FloatingToolbar } from './components/Journey/FloatingToolbar'
import { DevTools } from './components/Journey/DevTools'
import './App.css'

function App() {
  const canvasStageRef = useRef<CanvasStageHandle | null>(null)
  const wall = useCompositionStore((s) => s.wall)
  const isFullscreenPreview = useJourneyStore((s) => s.isFullscreenPreview)
  const exitFullscreenPreview = useJourneyStore((s) => s.exitFullscreenPreview)

  const handleExport = () => canvasStageRef.current?.exportImage()

  return (
    <div className={`app ${isFullscreenPreview ? 'appFullscreen' : ''}`}>
      {!isFullscreenPreview && (
        <header className="appHeader">
          <div className="brand">
            <span className="brandMark">FE</span>
            <span className="brandName">Frame Engine</span>
          </div>
          <StepProgress />
          <div className="headerBalance" />
        </header>
      )}

      <main className="appMain">
        <div className="canvasArea">
          <CanvasStage ref={canvasStageRef} />

          {wall && !isFullscreenPreview && (
            <div className="floatingToolbarWrap">
              <FloatingToolbar />
            </div>
          )}

          {isFullscreenPreview && (
            <button type="button" className="exitFullscreenButton" onClick={exitFullscreenPreview}>
              Exit Full Screen
            </button>
          )}
        </div>

        {wall && !isFullscreenPreview && <StepPanel onExport={handleExport} />}
      </main>

      {!isFullscreenPreview && <DevTools />}
    </div>
  )
}

export default App
