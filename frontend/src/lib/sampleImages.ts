export interface SampleImage {
  src: string
  width: number
  height: number
}

/** Procedurally draws a photo-like gradient placeholder (sky-to-ground with
 * a soft "sun" disc) so the Frame Lab can demo the glass/reflection effect
 * over something photographic without depending on any external asset. */
function drawSampleScene(ctx: CanvasRenderingContext2D, width: number, height: number, hueShift: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.65)
  sky.addColorStop(0, `hsl(${205 + hueShift}, 70%, 62%)`)
  sky.addColorStop(1, `hsl(${28 + hueShift}, 85%, 78%)`)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height * 0.65)

  ctx.fillStyle = `hsla(${45 + hueShift}, 95%, 88%, 0.9)`
  ctx.beginPath()
  ctx.arc(width * 0.68, height * 0.32, Math.min(width, height) * 0.11, 0, Math.PI * 2)
  ctx.fill()

  const ground = ctx.createLinearGradient(0, height * 0.6, 0, height)
  ground.addColorStop(0, `hsl(${130 + hueShift}, 30%, 34%)`)
  ground.addColorStop(1, `hsl(${130 + hueShift}, 35%, 18%)`)
  ctx.fillStyle = ground
  ctx.fillRect(0, height * 0.62, width, height * 0.38)

  ctx.strokeStyle = `hsla(${20 + hueShift}, 40%, 20%, 0.5)`
  ctx.lineWidth = Math.max(2, width * 0.006)
  ctx.beginPath()
  ctx.moveTo(width * 0.15, height)
  ctx.lineTo(width * 0.4, height * 0.63)
  ctx.lineTo(width * 0.55, height)
  ctx.stroke()
}

export function generateSampleImage(orientation: 'landscape' | 'portrait', hueShift = 0): SampleImage {
  const width = orientation === 'landscape' ? 1200 : 900
  const height = orientation === 'landscape' ? 900 : 1200
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) drawSampleScene(ctx, width, height, hueShift)
  return { src: canvas.toDataURL('image/png'), width, height }
}
