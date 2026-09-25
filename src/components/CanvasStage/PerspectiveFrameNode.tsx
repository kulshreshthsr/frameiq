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
  interactive: boolean
  viewportScale: number
  lightingFactor?: number
  onActivate: (frameId: string) => void
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
export function PerspectiveFrameNode({
  frame,
  style,
  isSelected,
  interactive,
  viewportScale,
  lightingFactor = 1,
  onActivate,
}: PerspectiveFrameNodeProps) {
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
    // Snapshot exactly the frame's own rectangle. Left to itself, Konva sizes
    // the snapshot from raw child geometry and ignores clip functions, so a
    // photo that overflows its opening (any cover-fit crop does) would
    // inflate the snapshot and the frame would be squeezed into the quad.
    // Konva also scales the output by the stage's current zoom; dividing the
    // pixel ratio by that zoom pins the snapshot at 2× the frame's logical
    // size regardless of how far in or out the customer has zoomed.
    const origin = node.getAbsolutePosition()
    const zoom = node.getAbsoluteScale().x || 1
    setSourceCanvas(
      node.toCanvas({
        x: origin.x,
        y: origin.y,
        width: frame.width * zoom,
        height: frame.height * zoom,
        pixelRatio: 2 / zoom,
      }),
    )
    // frame.photo/photoTransform are objects — re-snapshot whenever their
    // content (not just identity) changes. lightingFactor and the style affect
    // the moulding/glass shading FrameContent renders, so they belong here too.
  }, [frame.width, frame.height, style, frame.photo, frame.photoTransform, photoImage, lightingFactor])

  if (!frame.perspective) return null
  const quad = frame.perspective

  const refDim = Math.min(frame.width, frame.height)
  const quadPoints = quadToPoints(quad)

  const handleActivate = () => {
    if (interactive) onActivate(frame.id)
  }

  return (
    <>
      {/* Flat, unwarped source render — identical internal geometry to a
          normal frame, just parked off-screen so it never renders visibly. */}
      <Group ref={hiddenGroupRef} x={HIDDEN_SOURCE_X} y={0} listening={false}>
        <FrameContent frame={frame} style={style} lightingFactor={lightingFactor} />
      </Group>

      <ContactShadow refDim={refDim} style={style} lightingFactor={lightingFactor} quadPoints={quadPoints} />

      <Group listening={interactive}>
        {/* Invisible hit-target: the mesh cells below are listening={false}
            (they're pure raster draws), so this fill is what makes the
            warped frame clickable/selectable. */}
        <Line points={quadPoints} closed fill="rgba(0,0,0,0.001)" onClick={handleActivate} onTap={handleActivate} />

        {sourceCanvas && (
          // The snapshot is taken at 2× for sharpness, so the mesh must sample
          // the canvas's real pixel size — not the frame's logical size, which
          // would read only its top-left quarter.
          <PerspectiveMesh sourceCanvas={sourceCanvas} sourceWidth={sourceCanvas.width} sourceHeight={sourceCanvas.height} quad={quad} />
        )}
      </Group>

      {isSelected && (
        <>
          <Line points={quadPoints} closed stroke="#ffffff" strokeWidth={5 / viewportScale} listening={false} />
          <Line points={quadPoints} closed stroke="#b4532a" strokeWidth={2.5 / viewportScale} listening={false} />
        </>
      )}
    </>
  )
}
