import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type Konva from 'konva'
import { Stage, Layer, Rect } from 'react-konva'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { useJourneyStore } from '../../state/journeyStore'
import { resolveFrameStyle } from '../../domain/frameStyle'
import { getLayout } from '../../lib/layouts'
import { clamp } from '../../lib/geometry'
import { computeCanvasFit } from '../../lib/canvasFit'
import { computeDefaultCorners, inflateQuad } from '../../lib/perspective'
import { describeDesign } from '../../lib/frameLabels'
import { downloadBlob, exportStageAsImage } from '../../lib/exportStage'
import type { ExportResult } from '../../lib/exportSafety'
import { ACCEPTED_IMAGE_TYPES, MAX_ZOOM, MIN_ZOOM } from '../../lib/constants'
import { useFrameLighting } from '../../hooks/useFrameLighting'
import { usePhotoUpload } from '../../hooks/usePhotoUpload'
import { WallBackground } from './WallBackground'
import { FrameNode } from './FrameNode'
import { CompareReveal } from './CompareReveal'
import { PerspectiveHandles } from './PerspectiveHandles'
import { QuadHandles, QuadConnectorLines } from './QuadHandles'
import { WallRegionOverlay } from './WallRegionOverlay'
import { WallRegionHandles } from './WallRegionHandles'
import { ZoomControls } from './ZoomControls'
import styles from './CanvasStage.module.css'

export interface ExportOutcome {
  width: number
  height: number
  /** True when the saved image is smaller than the full-resolution composition. */
  reduced: boolean
}

export interface CanvasStageHandle {
  /** Renders the framed wall and saves it as a file. */
  exportImage: () => Promise<ExportOutcome>
  /** Renders the framed wall and returns it, without downloading (used to attach the final design to an order). */
  renderImage: () => Promise<ExportResult>
}

interface PinchState {
  lastDist: number
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export const CanvasStage = forwardRef<CanvasStageHandle>(function CanvasStage(_props, ref) {
  const wall = useCompositionStore((s) => s.wall)
  const frames = useCompositionStore((s) => s.frames)
  const activeLayoutId = useCompositionStore((s) => s.activeLayoutId)
  const placementMode = useCompositionStore((s) => s.placementMode)
  const wallRegion = useCompositionStore((s) => s.wallRegion)
  const step = useJourneyStore((s) => s.currentStep)
  const viewMode = useJourneyStore((s) => s.viewMode)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const perspectiveEditMode = useUIStore((s) => s.perspectiveEditMode)
  const isExportingPreview = useUIStore((s) => s.isExportingPreview)
  const debugReferenceQuad = useUIStore((s) => s.debugReferenceQuad)
  const setDebugReferenceQuad = useUIStore((s) => s.setDebugReferenceQuad)
  const updateDebugReferenceQuadCorner = useUIStore((s) => s.updateDebugReferenceQuadCorner)
  const viewport = useUIStore((s) => s.viewport)
  const selectFrame = useUIStore((s) => s.selectFrame)
  const setViewport = useUIStore((s) => s.setViewport)
  const fitViewport = useUIStore((s) => s.fitViewport)
  const lightingMap = useFrameLighting(wall, frames)
  const { addPhotos } = usePhotoUpload()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const pendingUploadFrameId = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pinchRef = useRef<PinchState | null>(null)

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the view auto-fit to the container until the user manually zooms/pans.
  useEffect(() => {
    if (!wall || containerSize.width === 0 || containerSize.height === 0) return
    if (useUIStore.getState().viewport.isCustom) return
    const fit = computeCanvasFit(containerSize, wall)
    fitViewport({ scale: fit.scale, x: fit.x, y: fit.y })
  }, [containerSize, wall, fitViewport])

  // Developer tool: seed the perspective-debug reference quad the moment a
  // frame is selected while perspective-editing (see uiStore.debugReferenceQuad).
  useEffect(() => {
    if (!import.meta.env.DEV || !perspectiveEditMode || debugReferenceQuad) return
    const frame = frames.find((f) => f.id === selectedFrameId)
    if (!frame) return
    const refDim = Math.min(frame.width, frame.height)
    setDebugReferenceQuad(inflateQuad(computeDefaultCorners(frame), Math.max(16, refDim * 0.08)))
  }, [perspectiveEditMode, debugReferenceQuad, selectedFrameId, frames, setDebugReferenceQuad])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectFrame(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectFrame])

  /** Renders the whole framed wall to an image at the best size this device can safely make. */
  const capture = async (): Promise<ExportResult> => {
    const stage = stageRef.current
    if (!stage || !wall || containerSize.width === 0 || containerSize.height === 0) {
      throw new Error('canvas not ready')
    }
    const previous = {
      selection: useUIStore.getState().selectedFrameId,
      viewport: useUIStore.getState().viewport,
      viewMode: useJourneyStore.getState().viewMode,
      fraction: useJourneyStore.getState().compareFraction,
    }
    // Hide selection outlines, wall handles and empty-frame hints so the
    // image shows only the physical composition — and always render the
    // finished design, never a before/compare view.
    selectFrame(null)
    useUIStore.setState({ isExportingPreview: true })
    useJourneyStore.getState().showAfterImmediately()

    // Frame the whole wall photo in view (independent of the user's current
    // pan/zoom) so the crop below always captures the full composition.
    const fit = computeCanvasFit(containerSize, wall)
    fitViewport({ scale: fit.scale, x: fit.x, y: fit.y })

    try {
      // Two frames so both the state update and the resulting Konva redraw land first.
      await nextFrame()
      await nextFrame()
      return await exportStageAsImage(stage, { x: fit.x, y: fit.y, width: fit.width, height: fit.height }, { width: wall.width, height: wall.height })
    } finally {
      useUIStore.setState({ viewport: previous.viewport, isExportingPreview: false })
      useJourneyStore.setState({ viewMode: previous.viewMode, compareFraction: previous.fraction })
      selectFrame(previous.selection)
    }
  }

  useImperativeHandle(ref, () => ({
    exportImage: async () => {
      const result = await capture()
      downloadBlob(result.blob, 'my-wall.png')
      return { width: result.width, height: result.height, reduced: result.reduced }
    },
    renderImage: capture,
  }))

  const baseFit = wall ? computeCanvasFit(containerSize, wall) : { scale: 1, x: 0, y: 0, width: 1, height: 1 }
  const minScale = baseFit.scale * MIN_ZOOM
  const maxScale = baseFit.scale * MAX_ZOOM

  const applyZoomAtPoint = (pointer: { x: number; y: number }, requestedScale: number) => {
    const stage = stageRef.current
    if (!stage) return
    const oldScale = stage.scaleX()
    const newScale = clamp(requestedScale, minScale, maxScale)
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }
    setViewport({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) return
    const scaleBy = e.evt.deltaY > 0 ? 0.9 : 1.1
    applyZoomAtPoint(pointer, stage.scaleX() * scaleBy)
  }

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length !== 2) return
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    if (stage.isDragging()) stage.stopDrag()

    const rect = stage.container().getBoundingClientRect()
    const p1 = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top }
    const p2 = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top }
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)

    if (pinchRef.current) applyZoomAtPoint(center, stage.scaleX() * (dist / pinchRef.current.lastDist))
    pinchRef.current = { lastDist: dist }
  }

  const handleZoomButton = (factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    applyZoomAtPoint({ x: containerSize.width / 2, y: containerSize.height / 2 }, stage.scaleX() * factor)
  }

  const handleFit = () => {
    if (!wall) return
    fitViewport({ scale: baseFit.scale, x: baseFit.x, y: baseFit.y })
  }

  // Tapping an empty frame while adding photos opens the picker for it;
  // in any other step a tap just selects the frame.
  const handleActivate = useCallback(
    (frameId: string) => {
      selectFrame(frameId)
      const frame = useCompositionStore.getState().frames.find((f) => f.id === frameId)
      if (frame && !frame.photo && useJourneyStore.getState().currentStep === 3) {
        pendingUploadFrameId.current = frameId
        fileInputRef.current?.click()
      }
    },
    [selectFrame],
  )

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const frameId = pendingUploadFrameId.current
    e.target.value = ''
    if (file && frameId) await addPhotos([file], frameId)
  }

  if (!wall) return null

  const zoomPercent = Math.round((viewport.scale / baseFit.scale) * 100) || 100
  const selectedFrame = frames.find((f) => f.id === selectedFrameId)
  const interactive = step >= 3 && step <= 5
  const showWallEditor = step === 1 && placementMode === 'wall-surface' && wallRegion !== null && !isExportingPreview
  const layout = getLayout(activeLayoutId)

  return (
    <div ref={containerRef} className={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        hidden
        aria-label="Choose a photo for this frame"
        onChange={handlePhotoFileChange}
      />
      <div className={styles.canvasWrap} role="img" aria-label={describeDesign(frames)}>
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          x={viewport.x}
          y={viewport.y}
          // Panning only makes sense once zoomed in; at "fit" a stray drag
          // would just knock the photo off-centre.
          draggable={viewport.isCustom}
          onDragMove={(e) => {
            // Drag events bubble; only react when the Stage itself is the node
            // being dragged, not a bubbled event from a frame/handle drag.
            if (e.target !== e.target.getStage()) return
            setViewport({ x: e.target.x(), y: e.target.y() })
          }}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            pinchRef.current = null
          }}
          className={styles.stage}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) selectFrame(null)
          }}
          onTap={(e) => {
            if (e.target === e.target.getStage()) selectFrame(null)
          }}
        >
          <Layer>
            <WallBackground src={wall.src} width={wall.width} height={wall.height} viewportScale={viewport.scale} withShadow={!isExportingPreview} />
            {showWallEditor && wallRegion && <WallRegionOverlay region={wallRegion} />}

            <CompareReveal wall={wall} viewportScale={viewport.scale} showDivider={viewMode === 'compare' && !isExportingPreview}>
              {layout.decorativeElements?.map((el, i) => (
                <Rect
                  key={i}
                  x={(el.xPct - el.wPct / 2) * wall.width}
                  y={(el.yPct - el.hPct / 2) * wall.height}
                  width={el.wPct * wall.width}
                  height={el.hPct * wall.height}
                  fill={el.color}
                  opacity={el.opacity ?? 1}
                  cornerRadius={9999}
                  listening={false}
                />
              ))}
              {frames.map((frame) => (
                <FrameNode
                  key={frame.id}
                  frame={frame}
                  style={resolveFrameStyle(frame.productId, frame.matId)}
                  isSelected={selectedFrameId === frame.id}
                  interactive={interactive}
                  viewportScale={viewport.scale}
                  lightingFactor={lightingMap.get(frame.id) ?? 1}
                  onActivate={handleActivate}
                />
              ))}
            </CompareReveal>

            {import.meta.env.DEV && perspectiveEditMode && selectedFrame && debugReferenceQuad && (
              <QuadHandles
                quad={debugReferenceQuad}
                viewportScale={viewport.scale}
                onCornerDragMove={updateDebugReferenceQuadCorner}
                color="#22b573"
              />
            )}
            {import.meta.env.DEV && perspectiveEditMode && selectedFrame?.perspective && debugReferenceQuad && (
              <QuadConnectorLines from={debugReferenceQuad} to={selectedFrame.perspective} />
            )}
            {import.meta.env.DEV && perspectiveEditMode && selectedFrame?.perspective && (
              <PerspectiveHandles frame={selectedFrame} viewportScale={viewport.scale} />
            )}
            {showWallEditor && wallRegion && (
              <WallRegionHandles region={wallRegion} viewportScale={viewport.scale} wall={wall} />
            )}
          </Layer>
        </Stage>
      </div>

      {viewMode === 'compare' && !isExportingPreview && (
        <div className={styles.compareLabels} aria-hidden>
          <span className={styles.compareLabel}>Before</span>
          <span className={styles.compareLabel}>After</span>
        </div>
      )}

      {showWallEditor && <div className={styles.canvasHint}>Drag the corners onto your wall</div>}

      <ZoomControls
        zoomPercent={zoomPercent}
        onZoomIn={() => handleZoomButton(1.25)}
        onZoomOut={() => handleZoomButton(0.8)}
        onFit={handleFit}
      />
    </div>
  )
})
