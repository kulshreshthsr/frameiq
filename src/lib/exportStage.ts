import type Konva from 'konva'

interface ExportRegion {
  /** Crop rectangle in the stage's own pixel space (i.e. wherever the wall
   * image is currently rendered on screen), scaled up to native resolution
   * via pixelRatio. The caller is responsible for framing the stage so the
   * whole wall photo is in view before calling this. */
  x: number
  y: number
  width: number
  height: number
  pixelRatio: number
}

export function exportStageAsImage(
  stage: Konva.Stage,
  region: ExportRegion,
  fileName = 'frame-composition.png',
) {
  const dataUrl = stage.toDataURL({ mimeType: 'image/png', ...region })

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
