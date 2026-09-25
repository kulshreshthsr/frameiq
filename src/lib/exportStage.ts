import type Konva from 'konva'
import { canvasCanHold, detectCanvasLimits, exportWithFallback, type ExportResult } from './exportSafety'

export interface ExportRegion {
  /** Crop rectangle in the stage's own pixel space (i.e. wherever the wall
   * image is currently rendered on screen). The caller is responsible for
   * framing the stage so the whole wall photo is in view first. */
  x: number
  y: number
  width: number
  height: number
}

/**
 * Rasterizes the framed wall. `nativeSize` is the full-resolution pixel size
 * of the composition (the wall photo's own size); the actual output is
 * whatever the device can safely produce — see exportSafety.ts.
 */
export function exportStageAsImage(
  stage: Konva.Stage,
  region: ExportRegion,
  nativeSize: { width: number; height: number },
): Promise<ExportResult> {
  return exportWithFallback(nativeSize, detectCanvasLimits(), canvasCanHold, async (plan) => {
    const blob = await stage.toBlob({
      mimeType: 'image/png',
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      pixelRatio: plan.width / region.width,
    })
    return blob as Blob | null
  })
}

/** Hands a blob to the browser as a file download. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke after the browser has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
