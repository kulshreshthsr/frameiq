import { z } from 'zod'
import type { Catalog, ProductDef, SizeDef } from './catalog'
import { MAX_PRICE_MINOR } from './limits'

/**
 * THE OWNER ADMIN DOMAIN.
 *
 * Types and request validation shared between the admin frontend and the
 * server. Only ever imported by admin code (never by the customer-facing
 * bundle), so it is free to use zod without affecting the shopper's download.
 *
 * There is exactly one role today — OWNER — kept as a plain string rather
 * than a hard-coded enum so a second role later doesn't need a schema
 * migration; the server is what decides which roles may do what.
 */

export const OWNER_ROLE = 'owner'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

/**
 * A size, as the admin sees it: the catalog fields plus the bookkeeping that
 * makes safe concurrent editing possible. `rowVersion` is a per-row counter,
 * unrelated to `Catalog.version` (the whole catalog's content fingerprint,
 * which every order snapshot pins to) — it exists only so two open admin
 * tabs editing the same size can't silently overwrite one another: a save
 * must present the `rowVersion` it read, or it is refused.
 */
export interface AdminSizeView extends SizeDef {
  rowVersion: number
  updatedAt: string
}

export interface AdminProductView extends Omit<ProductDef, 'sizes'> {
  sizes: AdminSizeView[]
  rowVersion: number
  updatedAt: string
}

export interface AdminCatalog extends Omit<Catalog, 'products'> {
  products: AdminProductView[]
}

/** One row of "what changed, when, by whom" — a product/size field edit, a
 * bulk price update, or a revert. Bulk changes share a `batchId` so the
 * owner can see them as one event. */
export interface CatalogAuditEntry {
  id: number
  batchId: string
  actorUserId: string
  actorName: string
  action: string
  productId: string
  productSizeId: string | null
  field: string
  oldValue: string | null
  newValue: string | null
  oldPriceMinor: number | null
  newPriceMinor: number | null
  note: string | null
  createdAt: string
}

export interface AdminOrderSummary {
  publicOrderId: string
  customerName: string
  totalMinor: number
  currency: string
  paymentStatus: string
  orderStatus: string
  createdAt: string
}

export interface AdminOrderDetail extends AdminOrderSummary {
  customerMobile: string
  delivery: { line1: string; line2: string; city: string; state: string; pin: string }
  catalogVersion: string
  items: {
    productId: string
    productName: string
    sizeId: string
    sizeLabel: string
    glassName: string
    matName: string
    quantity: number
    unitPriceMinor: number
    lineTotalMinor: number
  }[]
  paidAt: string | null
}

export interface AdminDashboard {
  activeProductCount: number
  inactiveProductCount: number
  activeSkuCount: number
  inactiveSkuCount: number
  recentPriceChanges: CatalogAuditEntry[]
  recentOrders: AdminOrderSummary[]
}

// ---------------------------------------------------------------- validation

const PRODUCT_ID = /^[a-z][a-z0-9-]{1,39}$/
const SIZE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const money = () => z.number().int().min(0).max(MAX_PRICE_MINOR)
const shortText = (max: number) => z.string().trim().min(1).max(max)

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

/** A new product always starts INACTIVE — it has no sizes yet, and "active
 * with nothing to sell" is exactly what `validateCatalog` forbids. The owner
 * adds a size, then activates it with a normal update. */
export const productCreateSchema = z.object({
  id: z.string().regex(PRODUCT_ID, 'Use lowercase letters, numbers and hyphens, starting with a letter.'),
  name: shortText(120),
  tagline: shortText(160),
  description: shortText(2000),
  styleId: shortText(60),
  shipsWithMat: z.boolean(),
  glassOptionIds: z.array(shortText(60)).min(1, 'Offer at least one glass option.'),
  matOptionIds: z.array(shortText(60)).min(1, 'Offer at least one mat option.'),
  mouldingNote: z.string().trim().max(2000).optional(),
  productionNotes: z.string().trim().max(2000).optional(),
})
export type ProductCreateInput = z.infer<typeof productCreateSchema>

export const productUpdateSchema = z.object({
  expectedVersion: z.number().int().min(1),
  name: shortText(120).optional(),
  tagline: shortText(160).optional(),
  description: shortText(2000).optional(),
  styleId: shortText(60).optional(),
  shipsWithMat: z.boolean().optional(),
  glassOptionIds: z.array(shortText(60)).min(1).optional(),
  matOptionIds: z.array(shortText(60)).min(1).optional(),
  mouldingNote: z.string().trim().max(2000).nullable().optional(),
  productionNotes: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().optional(),
})
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>

export const sizeCreateSchema = z.object({
  id: z.string().regex(SIZE_ID, 'Use lowercase letters, numbers and hyphens.'),
  width: z.number().positive().max(500),
  height: z.number().positive().max(500),
  displayLabel: shortText(80),
  priceMinor: money(),
  glassSurchargeMinor: money().optional(),
  matSurchargeMinor: money().optional(),
  active: z.boolean().optional(),
})
export type SizeCreateInput = z.infer<typeof sizeCreateSchema>

export const sizeUpdateSchema = z.object({
  expectedVersion: z.number().int().min(1),
  displayLabel: shortText(80).optional(),
  priceMinor: money().optional(),
  glassSurchargeMinor: money().optional(),
  matSurchargeMinor: money().optional(),
  active: z.boolean().optional(),
})
export type SizeUpdateInput = z.infer<typeof sizeUpdateSchema>

export const bulkPriceUpdateSchema = z.object({
  note: z.string().trim().max(300).optional(),
  updates: z
    .array(
      z.object({
        productId: shortText(60),
        sizeId: shortText(60),
        newPriceMinor: money(),
        expectedVersion: z.number().int().min(1),
      }),
    )
    .min(1, 'Select at least one price to change.')
    .max(200, 'That’s too many at once — split it into smaller batches.'),
})
export type BulkPriceUpdateInput = z.infer<typeof bulkPriceUpdateSchema>

export const revertRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
})
export type RevertInput = z.infer<typeof revertRequestSchema>
