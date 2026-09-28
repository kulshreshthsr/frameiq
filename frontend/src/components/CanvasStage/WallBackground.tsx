import { Image as KonvaImage, Rect } from 'react-konva'
import useImage from 'use-image'

interface WallBackgroundProps {
  src: string
  width: number
  height: number
  /** Current zoom, so the drop shadow keeps a constant on-screen softness. */
  viewportScale: number
  /** The soft shadow lifts the photo off the canvas; it lies outside the
   * photo's bounds, so it never appears in an export. */
  withShadow?: boolean
}

export function WallBackground({ src, width, height, viewportScale, withShadow = true }: WallBackgroundProps) {
  const [image] = useImage(src)
  return (
    <>
      {withShadow && (
        <Rect
          width={width}
          height={height}
          fill="#d9d1c2"
          listening={false}
          shadowColor="#211c17"
          shadowBlur={28 / viewportScale}
          shadowOffsetY={8 / viewportScale}
          shadowOpacity={0.28}
        />
      )}
      <KonvaImage image={image} x={0} y={0} width={width} height={height} listening={false} />
    </>
  )
}
