import { Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'

interface WallBackgroundProps {
  src: string
  width: number
  height: number
}

export function WallBackground({ src, width, height }: WallBackgroundProps) {
  const [image] = useImage(src)
  return <KonvaImage image={image} x={0} y={0} width={width} height={height} listening={false} />
}
