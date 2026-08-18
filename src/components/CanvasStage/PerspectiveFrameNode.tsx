import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Line } from 'react-konva'
import useImage from 'use-image'
import type { FrameInstance, FrameStyleConfig } from '../../types/frame'
import { quadToPoints } from '../../lib/perspective'
import { ContactShadow } from './ContactShadow'
import { FrameContent } from './FrameContent'
import { PerspectiveMesh } from './PerspectiveMesh'

interface PerspectiveFrameNodeProps {
  frame: FrameInstance
  style: FrameStyleConfig
  isSelected: boolean
  lightingFactor?: number
  onSelect: () => void
  onRequestPhoto: () => void
}

// Rendered far outside any realistic wall-photo bounds so it never overlaps
// the visible composition, regardless of zoom/pan.
const HIDDEN_SOURCE_X = -100000

/**
 * Renders a frame whose four corners have been pinned to an arbitrary quad
 * (an angled-wall placement) instead of a plain rectangle. The frame's
 * normal internal composition (moulding → photo → glass) is rendered once,
 * unwarped, into an offscreen buffer via FrameContent — the same component
 * normal rectangular frames use — then that flat raster is projected onto
 * the destination quad by PerspectiveMesh. Nothing about the frame's
 * internal geometry changes; only its on-wall presentation does.
 */
export function PerspectiveFrameNode({ frame, style, isSelected, lightingFactor = 1, onSelect, onRequestPhoto }: PerspectiveFrameNodeProps) {
  const hiddenGroupRef = useRef<Konva.Group | null>(null)
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null)
  // FramedPhoto loads the photo asynchronously via the same hook — without
  // tracking that here too, the offscreen snapshot below can fire before the
  // image has actually decoded, capturing an empty placeholder instead.
  const [photoImage] = useImage(frame.photo?.src ?? '')

  useEffect(() => {
    const node = hiddenGroupRef.current
    if (!node) return
    if (frame.photo && !photoImage) return
    setSourceCanvas(node.toCanvas({ pixelRatio: 2 }))
    // frame.photo/photoTransform are objects — re-snapshot whenever their
    // content (not just identity) changes. lightingFactor affects the
    // moulding/glass shading FrameContent renders, so it needs to be here too.
  }, [frame.width, frame.height, frame.styleId, frame.photo, frame.photoTransform, photoImage, lightingFactor])

  if (!frame.perspective) return null
  const quad = frame.perspective

  const refDim = Math.min(frame.width, frame.height)
  const quadPoints = quadToPoints(quad)

  const handleClick = () => {
    if (!frame.photo) {
      onSelect()
      onRequestPhoto()
      return
    }
    onSelect()
  }

  return (
    <>
      {/* Flat, unwarped source render — identical internal geometry to a
          normal frame, just parked off-screen so it never renders visibly. */}
      <Group ref={hiddenGroupRef} x={HIDDEN_SOURCE_X} y={0} listening={false}>
        <FrameContent frame={frame} style={style} isEditingPhoto={false} lightingFactor={lightingFactor} onPhotoDragEnd={() => {}} onPhotoWheel={() => {}} />
      </Group>

      <ContactShadow refDim={refDim} style={style} lightingFactor={lightingFactor} quadPoints={quadPoints} />

      <Group>
        {/* Invisible hit-target: the mesh cells below are listening={false}
            (they're pure raster draws), so this fill is what makes the
            warped frame clickable/selectable. */}
        <Line points={quadPoints} closed fill="rgba(0,0,0,0.001)" onClick={handleClick} onTap={handleClick} />

        {sourceCanvas && (
          <PerspectiveMesh sourceCanvas={sourceCanvas} sourceWidth={frame.width} sourceHeight={frame.height} quad={quad} />
        )}
      </Group>

      {isSelected && (
        <Line points={quadPoints} closed stroke="#2f8fff" strokeWidth={1.5} listening={false} />
      )}
    </>
  )
}
