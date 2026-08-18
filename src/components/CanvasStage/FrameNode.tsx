import { useRef } from 'react'
import type Konva from 'konva'
import { Group, Rect } from 'react-konva'
import type { FrameInstance, FrameStyleConfig } from '../../types/frame'
import { clamp } from '../../lib/geometry'
import { computeInnerOpening, coverScaleForRotation } from '../../lib/frameGeometry'
import { useCompositionStore } from '../../state/compositionStore'
import { ContactShadow } from './ContactShadow'
import { FrameContent } from './FrameContent'
import { PerspectiveFrameNode } from './PerspectiveFrameNode'

interface FrameNodeProps {
  frame: FrameInstance
  style: FrameStyleConfig
  isSelected: boolean
  isEditingPhoto: boolean
  /** Ambient lighting nudge sampled from the wall around this frame (see
   * useFrameLighting) — defaults to neutral (1) when not provided. */
  lightingFactor?: number
  registerNode: (id: string, node: Konva.Group | null) => void
  onSelect: () => void
  onEnterPhotoEdit: () => void
  onRequestPhoto: () => void
}

/**
 * Coordinates one frame's interactions (select/drag/resize/rotate, and
 * entering photo-edit mode) and composes the visual stack in the required
 * order: shadow (this Group) → frame body → photograph → glass/reflection →
 * frame highlights. Each stage is a distinct Konva node — nothing is
 * flattened into a single image while editing.
 *
 * A frame with perspective corners set is delegated entirely to
 * PerspectiveFrameNode instead — this normal path is untouched by that mode.
 */
export function FrameNode({
  frame,
  style,
  isSelected,
  isEditingPhoto,
  lightingFactor = 1,
  registerNode,
  onSelect,
  onEnterPhotoEdit,
  onRequestPhoto,
}: FrameNodeProps) {
  const groupRef = useRef<Konva.Group | null>(null)
  const updateFrameTransform = useCompositionStore((s) => s.updateFrameTransform)
  const updateFramePhotoTransform = useCompositionStore((s) => s.updateFramePhotoTransform)

  const refDim = Math.min(frame.width, frame.height)
  const opening = computeInnerOpening(frame.width, frame.height, style)
  const { outerThickness, innerThickness, width: innerWidth, height: innerHeight } = opening
  const innerX = outerThickness + innerThickness
  const innerY = outerThickness + innerThickness

  const handleTransformEnd = () => {
    const node = groupRef.current
    if (!node) return
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    const newWidth = Math.max(40, frame.width * scaleX)
    const newHeight = Math.max(40, frame.height * scaleY)
    node.scaleX(1)
    node.scaleY(1)
    updateFrameTransform(frame.id, {
      x: node.x(),
      y: node.y(),
      width: newWidth,
      height: newHeight,
      rotation: node.rotation(),
    })
  }

  const handleClick = () => {
    if (!frame.photo) {
      onSelect()
      onRequestPhoto()
      return
    }
    onSelect()
  }

  const handlePhotoDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Konva drag events bubble like other events — without stopping it here,
    // this would also reach the frame Group's own onDragEnd below, which
    // would misread the photo's local x/y as the frame's position.
    e.cancelBubble = true
    updateFramePhotoTransform(frame.id, {
      offsetX: e.target.x() - innerWidth / 2,
      offsetY: e.target.y() - innerHeight / 2,
    })
  }

  const handlePhotoWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    if (!isEditingPhoto || !frame.photo) return
    e.evt.preventDefault()
    e.cancelBubble = true // keep this from also triggering workspace zoom
    if (e.evt.shiftKey) {
      const nextRotation = frame.photoTransform.rotation + (e.evt.deltaY > 0 ? 5 : -5)
      updateFramePhotoTransform(frame.id, { rotation: nextRotation })
      return
    }
    // Rotation-aware: a photo rotated away from 0° needs a different (larger,
    // in the general case) minimum scale to still fully cover the opening.
    const minScale = coverScaleForRotation(innerWidth, innerHeight, frame.photo.width, frame.photo.height, frame.photoTransform.rotation)
    const factor = e.evt.deltaY > 0 ? 0.95 : 1.05
    const nextScale = clamp(frame.photoTransform.scale * factor, minScale, minScale * 4)
    updateFramePhotoTransform(frame.id, { scale: nextScale })
  }

  if (frame.perspective) {
    return (
      <PerspectiveFrameNode
        frame={frame}
        style={style}
        isSelected={isSelected}
        lightingFactor={lightingFactor}
        onSelect={onSelect}
        onRequestPhoto={onRequestPhoto}
      />
    )
  }

  return (
    <Group
      ref={(node) => {
        groupRef.current = node
        registerNode(frame.id, node)
      }}
      x={frame.x}
      y={frame.y}
      offsetX={frame.width / 2}
      offsetY={frame.height / 2}
      rotation={frame.rotation}
      draggable={!isEditingPhoto}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={() => frame.photo && onEnterPhotoEdit()}
      onDblTap={() => frame.photo && onEnterPhotoEdit()}
      onDragEnd={(e) => {
        // Guard against a bubbled dragend from a draggable descendant (e.g.
        // the photo while editing) being mistaken for this frame's own drag.
        if (e.target !== e.currentTarget) return
        updateFrameTransform(frame.id, { x: e.target.x(), y: e.target.y() })
      }}
      onTransformEnd={handleTransformEnd}
    >
      <ContactShadow refDim={refDim} style={style} lightingFactor={lightingFactor} width={frame.width} height={frame.height} />

      <FrameContent
        frame={frame}
        style={style}
        isEditingPhoto={isEditingPhoto}
        lightingFactor={lightingFactor}
        onPhotoDragEnd={handlePhotoDragEnd}
        onPhotoWheel={handlePhotoWheel}
      />

      {isEditingPhoto && (
        <Rect
          x={innerX}
          y={innerY}
          width={innerWidth}
          height={innerHeight}
          stroke="#2f8fff"
          strokeWidth={2}
          dash={[6, 4]}
          listening={false}
        />
      )}
      {isSelected && (
        <Rect
          width={frame.width}
          height={frame.height}
          stroke="#2f8fff"
          strokeWidth={1}
          listening={false}
        />
      )}
    </Group>
  )
}
