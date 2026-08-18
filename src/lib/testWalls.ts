import type { PerspectiveCorners } from '../types/frame'

export interface SampleImage {
  src: string
  width: number
  height: number
}

function seededRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** A front-facing brick wall: offset rows of bricks over a mortar-colored
 * base, with a little per-brick hue/lightness jitter so it doesn't read as
 * a flat repeating tile. */
function drawBrickWall(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#c9c2b8'
  ctx.fillRect(0, 0, width, height)

  const brickHeight = height / 14
  const brickWidth = brickHeight * 2.1
  const mortarGap = Math.max(1, brickHeight * 0.08)
  const rand = seededRand(7)

  let row = 0
  for (let y = 0; y < height; y += brickHeight) {
    const offset = row % 2 === 0 ? 0 : -brickWidth / 2
    for (let x = offset; x < width; x += brickWidth) {
      const hueShift = (rand() - 0.5) * 18
      const light = 38 + (rand() - 0.5) * 8
      ctx.fillStyle = `hsl(${14 + hueShift}, 42%, ${light}%)`
      ctx.fillRect(x + mortarGap / 2, y + mortarGap / 2, brickWidth - mortarGap, brickHeight - mortarGap)
    }
    row++
  }
}

/** A flat painted wall at a given base lightness, with a soft top-to-bottom
 * gradient and faint noise so it isn't a perfectly flat fill. */
function drawFlatWall(ctx: CanvasRenderingContext2D, width: number, height: number, baseLightness: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, height)
  grad.addColorStop(0, `hsl(40, 8%, ${Math.min(97, baseLightness + 6)}%)`)
  grad.addColorStop(1, `hsl(40, 8%, ${Math.max(2, baseLightness - 6)}%)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  const rand = seededRand(11)
  ctx.globalAlpha = 0.045
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#000000' : '#ffffff'
    ctx.fillRect(rand() * width, rand() * height, 1.5, 1.5)
  }
  ctx.globalAlpha = 1
}

/** A living-room-style wall: painted wall, baseboard, floor, plus a couch
 * and plant silhouette so frame scale has a real-world reference. */
function drawFurnishedRoom(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const wallBottom = height * 0.74
  const baseboardBottom = height * 0.78

  const wallGrad = ctx.createLinearGradient(0, 0, 0, wallBottom)
  wallGrad.addColorStop(0, 'hsl(38, 18%, 82%)')
  wallGrad.addColorStop(1, 'hsl(38, 14%, 74%)')
  ctx.fillStyle = wallGrad
  ctx.fillRect(0, 0, width, wallBottom)

  ctx.fillStyle = '#ece7dd'
  ctx.fillRect(0, wallBottom, width, baseboardBottom - wallBottom)

  const floorGrad = ctx.createLinearGradient(0, baseboardBottom, 0, height)
  floorGrad.addColorStop(0, 'hsl(28, 24%, 32%)')
  floorGrad.addColorStop(1, 'hsl(28, 26%, 20%)')
  ctx.fillStyle = floorGrad
  ctx.fillRect(0, baseboardBottom, width, height - baseboardBottom)

  // Couch silhouette, bottom-left.
  ctx.fillStyle = 'hsl(210, 18%, 30%)'
  const couchX = width * 0.04
  const couchW = width * 0.26
  const couchH = height * 0.15
  const couchY = wallBottom - couchH
  ctx.fillRect(couchX, couchY, couchW, couchH)
  ctx.fillRect(couchX - 6, couchY - height * 0.045, couchW + 12, height * 0.05)

  // Potted plant silhouette, bottom-right.
  const potX = width * 0.86
  const potW = width * 0.06
  const potY = wallBottom - height * 0.02
  ctx.fillStyle = 'hsl(20, 20%, 26%)'
  ctx.fillRect(potX, potY, potW, height * 0.05)
  ctx.fillStyle = 'hsl(130, 30%, 26%)'
  const rand = seededRand(23)
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.ellipse(
      potX + potW / 2 + Math.cos(i * 1.4) * potW * 0.5,
      potY - height * (0.03 + i * 0.022),
      width * 0.022,
      height * 0.045,
      i * 0.5 + rand() * 0.3,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
}

/** A dim, warm-toned room with a soft radial falloff toward the corners —
 * evening/lamp lighting rather than daylight. */
function drawLowLightRoom(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const grad = ctx.createRadialGradient(width * 0.5, height * 0.35, width * 0.05, width * 0.5, height * 0.5, width * 0.75)
  grad.addColorStop(0, 'hsl(28, 32%, 22%)')
  grad.addColorStop(1, 'hsl(230, 14%, 7%)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

function toSampleImage(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): SampleImage {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, width, height)
  return { src: canvas.toDataURL('image/png'), width, height }
}

export function generateBrickWall(width = 1200, height = 900): SampleImage {
  return toSampleImage(width, height, drawBrickWall)
}

export function generateWhiteWall(width = 1200, height = 900): SampleImage {
  return toSampleImage(width, height, (ctx, w, h) => drawFlatWall(ctx, w, h, 90))
}

export function generateDarkWall(width = 1200, height = 900): SampleImage {
  return toSampleImage(width, height, (ctx, w, h) => drawFlatWall(ctx, w, h, 20))
}

export function generateFurnishedRoom(width = 1200, height = 900): SampleImage {
  return toSampleImage(width, height, drawFurnishedRoom)
}

export function generateLowLightRoom(width = 1200, height = 900): SampleImage {
  return toSampleImage(width, height, drawLowLightRoom)
}

/**
 * A WxH rectangle viewed by a camera panned `tiltDeg` off perpendicular
 * (rotated about the rectangle's own vertical axis), projected with simple
 * perspective — produces a genuine trapezoid with converging edges, not a
 * parallelogram shear, so it actually exercises the projective mesh-warp
 * path (a plain shear has parallel opposite edges and would silently skip
 * it). Result is shifted so its bounding box starts near (0,0), matching
 * how a caller would position a "frame-sized area on the wall" quad.
 */
export function buildAngleSweepQuad(width: number, height: number, tiltDeg: number): PerspectiveCorners {
  const theta = (tiltDeg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const distance = width * 2.2
  const focal = distance

  const project = (px: number, py: number) => {
    const rx = px * cos
    const rz = px * sin
    const scale = focal / (distance + rz)
    return { x: rx * scale, y: py * scale }
  }

  const hw = width / 2
  const hh = height / 2
  const corners = {
    topLeft: project(-hw, -hh),
    topRight: project(hw, -hh),
    bottomRight: project(hw, hh),
    bottomLeft: project(-hw, hh),
  }

  const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x]
  const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y]
  const offsetX = -Math.min(...xs)
  const offsetY = -Math.min(...ys)

  const shift = (p: { x: number; y: number }) => ({ x: p.x + offsetX, y: p.y + offsetY })

  return {
    topLeft: shift(corners.topLeft),
    topRight: shift(corners.topRight),
    bottomRight: shift(corners.bottomRight),
    bottomLeft: shift(corners.bottomLeft),
  }
}
