import { z } from 'zod'
import { customerSchema, deliverySchema } from './customer'
import { MAX_FRAMES, MAX_WALL_WIDTH_CM, MIN_WALL_WIDTH_CM } from './limits'

/**
 * THE ORDER CONTRACT.
 *
 * A deliberate, versioned description of what a customer is ordering — NOT a
 * dump of application state. The browser builds it, the server validates it
 * against the same schema, and it is stored with the order so a human can
 * reconstruct exactly what was designed.
 *
 * Bump DESIGN_SNAPSHOT_VERSION when the shape changes in a way old orders
 * couldn't be read under.
 */

export const DESIGN_SNAPSHOT_VERSION = 1

const id = z.string().min(1).max(120)
const num = z.number()
const positive = z.number().positive()
const wholePositive = z.number().int().positive()
const point = z.object({ x: num, y: num })

export const quadSchema = z.object({
  topLeft: point,
  topRight: point,
  bottomRight: point,
  bottomLeft: point,
})

/**
 * A reference to an image that lives outside the snapshot. `width/height` are
 * the EDITING copy the design was made on; `sourceWidth/sourceHeight` are the
 * ORIGINAL the customer supplied — the one production must print from.
 */
export const assetRefSchema = z.object({
  assetId: id,
  width: wholePositive,
  height: wholePositive,
  sourceWidth: wholePositive,
  sourceHeight: wholePositive,
})

/** The part of the ORIGINAL image that shows inside the frame, as fractions
 * (0–1) of the un-rotated image. `rotationDeg` is how far the photo is turned
 * first. Independent of any screen size, so a manufacturer can crop the
 * original with it directly. */
export const cropSchema = z.object({
  x: num,
  y: num,
  width: positive,
  height: positive,
  rotationDeg: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
})

export const frameSnapshotSchema = z.object({
  id,
  slotId: id,
  /** 1-based position on the wall, matching "Frame 1, Frame 2…" in the UI. */
  number: wholePositive,
  productId: id,
  sizeId: id,
  orientation: z.enum(['portrait', 'landscape']),
  glassId: id,
  matId: id,
  anchor: z.object({ xPct: num, yPct: num }),
  tilt: num,
  /** Outer frame size and the visible opening, in inches, as ordered. */
  sizeIn: z.object({ width: positive, height: positive }),
  openingIn: z.object({ width: positive, height: positive }),
  /** Where the frame was drawn on the wall photo, in that photo's pixels. */
  geometry: z.object({
    x: num,
    y: num,
    width: positive,
    height: positive,
    rotation: num,
    perspective: quadSchema.optional(),
  }),
  photo: z
    .object({
      asset: assetRefSchema,
      transform: z.object({ offsetX: num, offsetY: num, scale: positive, rotation: num }),
      crop: cropSchema,
    })
    .nullable(),
})

export const orderItemSnapshotSchema = z.object({
  productId: id,
  sizeId: id,
  glassId: id,
  matId: id,
  quantity: wholePositive,
})

export const designSnapshotSchema = z.object({
  schemaVersion: z.literal(DESIGN_SNAPSHOT_VERSION),
  app: z.object({ name: z.string().max(60), version: z.string().max(40), catalogVersion: z.string().max(80) }),
  createdAt: z.iso.datetime(),
  wall: z.object({
    asset: assetRefSchema,
    widthCm: z.number().min(MIN_WALL_WIDTH_CM).max(MAX_WALL_WIDTH_CM),
    placementMode: z.enum(['free', 'wall-surface']),
    region: quadSchema.nullable(),
  }),
  layoutId: id,
  frames: z.array(frameSnapshotSchema).min(1).max(MAX_FRAMES),
  items: z.array(orderItemSnapshotSchema).min(1).max(MAX_FRAMES),
  /** What the customer was shown. The server ignores these as a source of
   * truth — it recomputes — and uses them only to detect a price change. */
  pricing: z.object({
    currency: z.string().length(3),
    subtotalMinor: z.number().int().nonnegative(),
    deliveryFeeMinor: z.number().int().nonnegative(),
    totalMinor: z.number().int().nonnegative(),
  }),
})

export type DesignSnapshot = z.infer<typeof designSnapshotSchema>
export type FrameSnapshot = z.infer<typeof frameSnapshotSchema>
export type AssetRef = z.infer<typeof assetRefSchema>
export type Crop = z.infer<typeof cropSchema>

// ---------------------------------------------------------------- requests

/** Upload ids are content-addressed: `up_` + the first 32 hex chars of the SHA-256. */
export const uploadIdSchema = z.string().regex(/^up_[0-9a-f]{32}$/, 'invalid upload id')

/** A client-generated secret that proves the same browser is asking about an
 * order later (there are no accounts). High entropy, URL-safe. */
export const accessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'invalid access token')

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/, 'invalid idempotency key')

export const createOrderRequestSchema = z.object({
  snapshot: designSnapshotSchema,
  customer: customerSchema,
  delivery: deliverySchema,
  accessToken: accessTokenSchema,
  uploads: z.object({
    wall: uploadIdSchema,
    preview: uploadIdSchema,
    /** assetId → upload id, for every frame photo. */
    photos: z.record(z.string().min(1).max(120), uploadIdSchema),
  }),
})

export type CreateOrderRequest = z.input<typeof createOrderRequestSchema>
export type ParsedCreateOrderRequest = z.output<typeof createOrderRequestSchema>

// ---------------------------------------------------------------- statuses

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const ORDER_STATUSES = ['pending_payment', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** One payment attempt. A single order may have several (fail, then retry). */
export const PAYMENT_ATTEMPT_STATUSES = ['created', 'paid', 'failed', 'cancelled', 'refunded'] as const
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number]

// ---------------------------------------------------------------- responses

export interface OrderItemView {
  productId: string
  productName: string
  sizeId: string
  sizeLabel: string
  glassName: string
  matName: string
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
}

export interface OrderView {
  publicOrderId: string
  currency: string
  items: OrderItemView[]
  subtotalMinor: number
  deliveryFeeMinor: number
  totalMinor: number
  paymentStatus: PaymentStatus
  orderStatus: OrderStatus
  customerName: string
  deliveryCity: string
  deliveryState: string
  deliveryPin: string
  createdAt: string
  paidAt: string | null
  /** The most recent payment attempt, so a returning customer sees what happened. */
  lastPayment: { status: PaymentAttemptStatus; failureReason: string | null } | null
}
