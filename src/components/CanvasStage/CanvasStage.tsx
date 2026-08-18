import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type Konva from 'konva'
import { Stage, Layer, Rect, Circle, Line, Transformer } from 'react-konva'
import { useCompositionStore } from '../../state/compositionStore'
import { useUIStore } from '../../state/uiStore'
import { useJourneyStore } from '../../state/journeyStore'
import { getFrameStyle } from '../../lib/frameStyles'
import { getLayout } from '../../lib/layouts'
import { clamp, fitContain } from '../../lib/geometry'
import { computeDefaultCorners, inflateQuad } from '../../lib/perspective'
import { validateAndLoadImage } from '../../lib/validateAndLoadImage'
import { exportStageAsImage } from '../../lib/exportStage'
import { MAX_ZOOM, MIN_ZOOM } from '../../lib/constants'
import { useFrameLighting } from '../../hooks/useFrameLighting'
import { WallBackground } from './WallBackground'
import { FrameNode } from './FrameNode'
import { PerspectiveHandles } from './PerspectiveHandles'
import { QuadHandles, QuadConnectorLines } from './QuadHandles'
import { WallRegionOverlay } from './WallRegionOverlay'
import { WallRegionHandles } from './WallRegionHandles'
import { ZoomControls } from './ZoomControls'
import { WallUploader } from '../WallUploader/WallUploader'
import styles from './CanvasStage.module.css'

const WALL_SELECTION_STEPS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const

export interface CanvasStageHandle {
  exportImage: () => void
}

interface PinchState {
  lastDist: number
}

export const CanvasStage = forwardRef<CanvasStageHandle>((_props, ref) => {
  const wall = useCompositionStore((s) => s.wall)
  const frames = useCompositionStore((s) => s.frames)
  const activeLayoutId = useCompositionStore((s) => s.activeLayoutId)
  const placementMode = useCompositionStore((s) => s.placementMode)
  const wallRegion = useCompositionStore((s) => s.wallRegion)
  const setWallRegion = useCompositionStore((s) => s.setWallRegion)
  const setFramePhoto = useCompositionStore((s) => s.setFramePhoto)
  const selectedFrameId = useUIStore((s) => s.selectedFrameId)
  const editingPhotoFrameId = useUIStore((s) => s.editingPhotoFrameId)
  const perspectiveEditMode = useUIStore((s) => s.perspectiveEditMode)
  const isSelectingWall = useUIStore((s) => s.isSelectingWall)
  const stopWallSelection = useUIStore((s) => s.stopWallSelection)
  const isExportingPreview = useUIStore((s) => s.isExportingPreview)
  const debugReferenceQuad = useUIStore((s) => s.debugReferenceQuad)
  const setDebugReferenceQuad = useUIStore((s) => s.setDebugReferenceQuad)
  const updateDebugReferenceQuadCorner = useUIStore((s) => s.updateDebugReferenceQuadCorner)
  const showBefore = useJourneyStore((s) => s.showBefore)
  const viewport = useUIStore((s) => s.viewport)
  const selectFrame = useUIStore((s) => s.selectFrame)
  const setEditingPhoto = useUIStore((s) => s.setEditingPhoto)
  const setViewport = useUIStore((s) => s.setViewport)
  const fitViewport = useUIStore((s) => s.fitViewport)
  const lightingMap = useFrameLighting(wall, frames)

  const [wallClickPoints, setWallClickPoints] = useState<{ x: number; y: number }[]>([])

  useEffect(() => {
    if (!isSelectingWall) setWallClickPoints([])
  }, [isSelectingWall])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const frameNodes = useRef(new Map<string, Konva.Group>())
  const pendingUploadFrameId = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pinchRef = useRef<PinchState | null>(null)

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the view auto-fit to the container until the user manually zooms/pans.
  useEffect(() => {
    if (!wall || containerSize.width === 0 || containerSize.height === 0) return
    if (useUIStore.getState().viewport.isCustom) return
    const fit = fitContain(containerSize.width, containerSize.height, wall.width, wall.height)
    fitViewport({
      scale: fit.scale,
      x: (containerSize.width - fit.width) / 2,
      y: (containerSize.height - fit.height) / 2,
    })
  }, [containerSize.width, containerSize.height, wall, fitViewport])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    if (editingPhotoFrameId || !selectedFrameId) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }
    const node = frameNodes.current.get(selectedFrameId)
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedFrameId, editingPhotoFrameId, frames])

  // Seed the perspective-debug reference quad the moment it's needed: a
  // frame is selected while perspective-editing and no guide exists yet.
  // Starts just outside the frame's own unwarped position (not exactly
  // coincident with it — two perfectly overlapping quads' corner handles
  // would stack at identical screen positions, and the frame's own handles,
  // rendered on top, would intercept every click meant for the reference
  // quad underneath, making it undraggable). The developer drags it outward
  // further to trace the photographed wall's true shape.
  useEffect(() => {
    if (!perspectiveEditMode || debugReferenceQuad) return
    const frame = frames.find((f) => f.id === selectedFrameId)
    if (!frame) return
    const refDim = Math.min(frame.width, frame.height)
    setDebugReferenceQuad(inflateQuad(computeDefaultCorners(frame), Math.max(16, refDim * 0.08)))
  }, [perspectiveEditMode, debugReferenceQuad, selectedFrameId, frames, setDebugReferenceQuad])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSelectingWall) {
          stopWallSelection()
          return
        }
        selectFrame(null)
        setEditingPhoto(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectFrame, setEditingPhoto, isSelectingWall, stopWallSelection])

  useEffect(() => {
    if (!photoUploadError) return
    const timer = setTimeout(() => setPhotoUploadError(null), 4500)
    return () => clearTimeout(timer)
  }, [photoUploadError])

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const stage = stageRef.current
      if (!stage || !wall || containerSize.width === 0 || containerSize.height === 0) return
      const previousSelection = selectedFrameId
      const previousEditing = editingPhotoFrameId
      const previousViewport = useUIStore.getState().viewport
      const wasShowingBefore = useJourneyStore.getState().showBefore
      selectFrame(null)
      setEditingPhoto(null)
      // Hides selection outlines and any perspective/wall-region handles so
      // the exported image shows only the physical composition, no chrome —
      // and always exports the "after" composition, never a Before view.
      useUIStore.setState({ isExportingPreview: true })
      useJourneyStore.getState().setBeforeAfter(false)

      // Frame the whole wall photo in view (independent of the user's current
      // pan/zoom) so the crop below always captures the full composition.
      const fit = fitContain(containerSize.width, containerSize.height, wall.width, wall.height)
      const offsetX = (containerSize.width - fit.width) / 2
      const offsetY = (containerSize.height - fit.height) / 2
      fitViewport({ scale: fit.scale, x: offsetX, y: offsetY })

      // Two rAFs so both the state update and the resulting Konva redraw land
      // before we rasterize.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          exportStageAsImage(stage, {
            x: offsetX,
            y: offsetY,
            width: fit.width,
            height: fit.height,
            pixelRatio: wall.width / fit.width,
          })
          useUIStore.setState({ viewport: previousViewport, isExportingPreview: false })
          useJourneyStore.getState().setBeforeAfter(wasShowingBefore)
          selectFrame(previousSelection)
          setEditingPhoto(previousEditing)
        })
      })
    },
  }))

  const baseFit = wall
    ? fitContain(containerSize.width || 1, containerSize.height || 1, wall.width, wall.height)
    : { scale: 1, width: 1, height: 1 }
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
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }
    setViewport({ scale: newScale, x: newPos.x, y: newPos.y })
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

    if (pinchRef.current) {
      const scaleBy = dist / pinchRef.current.lastDist
      applyZoomAtPoint(center, stage.scaleX() * scaleBy)
    }
    pinchRef.current = { lastDist: dist }
  }

  const handleZoomButton = (factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const center = { x: containerSize.width / 2, y: containerSize.height / 2 }
    applyZoomAtPoint(center, stage.scaleX() * factor)
  }

  const handleFit = () => {
    if (!wall) return
    const fit = fitContain(containerSize.width, containerSize.height, wall.width, wall.height)
    fitViewport({
      scale: fit.scale,
      x: (containerSize.width - fit.width) / 2,
      y: (containerSize.height - fit.height) / 2,
    })
  }

  const deselectIfBackground = (target: Konva.Node) => {
    if (target === target.getStage()) {
      selectFrame(null)
      setEditingPhoto(null)
    }
  }

  const handleWallSelectionClick = () => {
    const stage = stageRef.current
    if (!stage) return
    const point = stage.getRelativePointerPosition()
    if (!point) return
    const next = [...wallClickPoints, { x: point.x, y: point.y }]
    if (next.length < 4) {
      setWallClickPoints(next)
      return
    }
    setWallRegion({ topLeft: next[0], topRight: next[1], bottomRight: next[2], bottomLeft: next[3] })
    stopWallSelection()
    setWallClickPoints([])
  }

  const handleRequestPhoto = (frameId: string) => {
    pendingUploadFrameId.current = frameId
    fileInputRef.current?.click()
  }

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const frameId = pendingUploadFrameId.current
    e.target.value = ''
    if (!file || !frameId) return
    try {
      const asset = await validateAndLoadImage(file)
      setFramePhoto(frameId, asset)
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : 'That photo could not be loaded.')
    }
  }

  if (!wall) {
    return (
      <div ref={containerRef} className={styles.container}>
        <WallUploader />
      </div>
    )
  }

  const zoomPercent = Math.round((viewport.scale / baseFit.scale) * 100)
  const selectedFrame = frames.find((f) => f.id === selectedFrameId)

  return (
    <div ref={containerRef} className={styles.container}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handlePhotoFileChange} />
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={viewport.x}
        y={viewport.y}
        draggable={!editingPhotoFrameId}
        onDragMove={(e) => {
          // Drag events bubble; only react when the Stage itself is the node
          // being dragged, not a bubbled event from a frame/photo drag.
          if (e.target !== e.target.getStage()) return
          setViewport({ x: e.target.x(), y: e.target.y() })
        }}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
          pinchRef.current = null
        }}
        className={styles.stage}
        onMouseDown={(e) => deselectIfBackground(e.target)}
        onTap={(e) => deselectIfBackground(e.target)}
      >
        <Layer>
          <WallBackground src={wall.src} width={wall.width} height={wall.height} />
          {!showBefore && (
            <>
              {placementMode === 'wall-surface' && wallRegion && !isExportingPreview && (
                <WallRegionOverlay region={wallRegion} />
              )}
              {getLayout(activeLayoutId).decorativeElements?.map((el, i) => (
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
                  style={getFrameStyle(frame.styleId)}
                  isSelected={selectedFrameId === frame.id}
                  isEditingPhoto={editingPhotoFrameId === frame.id}
                  lightingFactor={lightingMap.get(frame.id) ?? 1}
                  registerNode={(id, node) => {
                    if (node) frameNodes.current.set(id, node)
                    else frameNodes.current.delete(id)
                  }}
                  onSelect={() => selectFrame(frame.id)}
                  onEnterPhotoEdit={() => setEditingPhoto(frame.id)}
                  onRequestPhoto={() => handleRequestPhoto(frame.id)}
                />
              ))}
              <Transformer
                ref={transformerRef}
                rotateEnabled
                flipEnabled={false}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < 40 || newBox.height < 40 ? oldBox : newBox
                }
              />
              {perspectiveEditMode && selectedFrame && debugReferenceQuad && (
                <QuadHandles
                  quad={debugReferenceQuad}
                  viewportScale={viewport.scale}
                  onCornerDragMove={updateDebugReferenceQuadCorner}
                  color="#22b573"
                />
              )}
              {perspectiveEditMode && selectedFrame?.perspective && debugReferenceQuad && (
                <QuadConnectorLines from={debugReferenceQuad} to={selectedFrame.perspective} />
              )}
              {perspectiveEditMode && selectedFrame?.perspective && (
                <PerspectiveHandles frame={selectedFrame} viewportScale={viewport.scale} />
              )}
              {placementMode === 'wall-surface' && wallRegion && !isSelectingWall && !isExportingPreview && (
                <WallRegionHandles region={wallRegion} viewportScale={viewport.scale} />
              )}

              {isSelectingWall && (
                <>
                  <Rect
                    x={0}
                    y={0}
                    width={wall.width}
                    height={wall.height}
                    fill="rgba(0,0,0,0.001)"
                    onClick={handleWallSelectionClick}
                    onTap={handleWallSelectionClick}
                  />
                  {wallClickPoints.length > 1 && (
                    <Line
                      points={wallClickPoints.flatMap((p) => [p.x, p.y])}
                      stroke="#e08a1e"
                      strokeWidth={2 / viewport.scale}
                      listening={false}
                    />
                  )}
                  {wallClickPoints.map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={7 / viewport.scale}
                      fill="#e08a1e"
                      stroke="#ffffff"
                      strokeWidth={1.5 / viewport.scale}
                      listening={false}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </Layer>
      </Stage>

      <ZoomControls
        zoomPercent={zoomPercent}
        onZoomIn={() => handleZoomButton(1.25)}
        onZoomOut={() => handleZoomButton(0.8)}
        onFit={handleFit}
      />

      {isSelectingWall && (
        <div className={styles.wallSelectionBanner} role="status">
          Click the <strong>{WALL_SELECTION_STEPS[wallClickPoints.length]}</strong> corner of the wall
          ({wallClickPoints.length + 1} of 4) — Esc to cancel
        </div>
      )}

      {photoUploadError && (
        <div className={styles.photoErrorBanner} role="alert">
          {photoUploadError}
        </div>
      )}
    </div>
  )
})

CanvasStage.displayName = 'CanvasStage'
