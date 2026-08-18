import { MAX_WORKING_DIMENSION } from './constants'

export interface LoadedImageAsset {
  src: string
  width: number
  height: number
}

/**
 * Decodes a File into a usable image asset. Uses HTMLImageElement.decode()
 * so the (often expensive) decode step doesn't block the main thread the
 * way relying purely on the `load` event can.
 *
 * The original File is never touched. For photos far larger than the
 * viewport could ever usefully display, a downscaled working copy is
 * created instead so the canvas stays smooth — the source file on the
 * user's machine is unaffected either way.
 */
export async function loadImageAsset(file: File): Promise<LoadedImageAsset> {
  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.src = objectUrl

  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(objectUrl)
    throw new Error(`Could not read "${file.name}" — the file may be corrupted.`)
  }

  const width = img.naturalWidth
  const height = img.naturalHeight
  if (width === 0 || height === 0) {
    URL.revokeObjectURL(objectUrl)
    throw new Error(`"${file.name}" doesn't appear to be a valid image.`)
  }

  if (Math.max(width, height) <= MAX_WORKING_DIMENSION) {
    return { src: objectUrl, width, height }
  }

  const downscaled = await downscaleToWorkingCopy(img, width, height, MAX_WORKING_DIMENSION)
  if (!downscaled) {
    return { src: objectUrl, width, height }
  }
  URL.revokeObjectURL(objectUrl)
  return downscaled
}

async function downscaleToWorkingCopy(
  img: HTMLImageElement,
  width: number,
  height: number,
  maxEdge: number,
): Promise<LoadedImageAsset | null> {
  const scale = maxEdge / Math.max(width, height)
  const targetWidth = Math.round(width * scale)
  const targetHeight = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) return null

  return { src: URL.createObjectURL(blob), width: targetWidth, height: targetHeight }
}
