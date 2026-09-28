import { Fragment } from 'react'
import type Konva from 'konva'
import { Group, Rect, Text, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import type { ImageRef, PhotoTransform } from '../../types/frame'
import { useUIStore } from '../../state/uiStore'

export interface PhotoEditHandlers {
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onWheel?: (e: Konva.KonvaEventObject<WheelEvent>) => void
}

interface FramedPhotoProps {
  photo: ImageRef | null
  transform: PhotoTransform
  innerWidth: number
  innerHeight: number
  /** Present only while the crop editor has this photo open. */
  editing?: PhotoEditHandlers
}

/** Renders the customer's photo (or an empty-slot placeholder), independent
 * of the frame moulding around it. Knows nothing about frame styling. */
export function FramedPhoto({ photo, transform, innerWidth, innerHeight, editing }: FramedPhotoProps) {
  const [image] = useImage(photo?.src ?? '')
  const isExportingPreview = useUIStore((s) => s.isExportingPreview)

  if (!photo || !image) {
    return (
      <Group listening={false}>
        <Rect width={innerWidth} height={innerHeight} fill="#e9e2d4" />
        {/* The "+" affordance is a UI hint to click here, not part of the
         * physical composition — an exported/shared image shouldn't bake in
         * an icon that only makes sense inside the editor. */}
        {!isExportingPreview && (
          <>
            <Rect
              width={innerWidth}
              height={innerHeight}
              fill="#00000010"
              stroke="#00000040"
              dash={[8, 6]}
              strokeWidth={1.5}
            />
            <Text
              text="+"
              width={innerWidth}
              height={innerHeight}
              align="center"
              verticalAlign="middle"
              fontSize={Math.min(innerWidth, innerHeight) * 0.3}
              fill="#00000055"
            />
          </>
        )}
      </Group>
    )
  }

  return (
    <Fragment>
      <KonvaImage
        image={image}
        x={innerWidth / 2 + transform.offsetX}
        y={innerHeight / 2 + transform.offsetY}
        offsetX={photo.width / 2}
        offsetY={photo.height / 2}
        scaleX={transform.scale}
        scaleY={transform.scale}
        rotation={transform.rotation}
        draggable={Boolean(editing)}
        onDragMove={editing?.onDragMove}
        onDragEnd={editing?.onDragEnd}
        onWheel={editing?.onWheel}
      />
      {/* A very subtle print-like corner vignette, fixed to the opening
          (not the photo's own pan/zoom/rotation) — reads as a physical
          print under glass rather than a flat digital image. Distinct from
          GlassAndHighlight's inner-edge mat shadow: this darkens only the
          far corners, radially, rather than a uniform edge band. */}
      <Rect
        width={innerWidth}
        height={innerHeight}
        listening={false}
        fillRadialGradientStartPoint={{ x: innerWidth / 2, y: innerHeight / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: innerWidth / 2, y: innerHeight / 2 }}
        fillRadialGradientEndRadius={Math.hypot(innerWidth, innerHeight) / 2}
        fillRadialGradientColorStops={[0, 'rgba(0,0,0,0)', 0.7, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.12)']}
      />
    </Fragment>
  )
}
