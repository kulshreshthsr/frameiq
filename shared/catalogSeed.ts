import type { Catalog, ProductDef, SizeDef } from './catalog'
import { major } from './money'

/**
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  THE PRODUCT CATALOG — THE ONE FILE THE BUSINESS OWNER EDITS.          │
 * │                                                                        │
 * │  EVERYTHING BELOW IS PLACEHOLDER DATA for development and demos.       │
 * │  Names, sizes, prices, delivery charges and descriptions are           │
 * │  illustrative. They make no statement about real materials, quality    │
 * │  or guarantees. Replace them before launch.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * To change what is sold: edit this file, then run `npm run db:seed` to load
 * it into the database. Orders already placed are unaffected — every order
 * keeps a snapshot of the names and prices it was bought at.
 *
 * Prices are written in whole rupees for readability and stored as integer
 * paise (see money.ts).
 */

interface SizeSpec {
  id: string
  width: number
  height: number
  glassSurcharge: number
  matSurcharge: number
}

// Standard sizes in inches, stored portrait. Surcharges are per size.
const SIZE_SPECS: SizeSpec[] = [
  { id: '8x10', width: 8, height: 10, glassSurcharge: 149, matSurcharge: 99 },
  { id: '12x12', width: 12, height: 12, glassSurcharge: 199, matSurcharge: 129 },
  { id: '12x18', width: 12, height: 18, glassSurcharge: 249, matSurcharge: 149 },
  { id: '16x20', width: 16, height: 20, glassSurcharge: 299, matSurcharge: 179 },
  { id: '16x24', width: 16, height: 24, glassSurcharge: 349, matSurcharge: 199 },
  { id: '20x30', width: 20, height: 30, glassSurcharge: 549, matSurcharge: 249 },
  { id: '24x36', width: 24, height: 36, glassSurcharge: 799, matSurcharge: 329 },
]

/** Builds a product's size list from a `sizeId → ₹ price` table. Sizes a
 * product doesn't list simply aren't sold for it. */
function sizes(prices: Record<string, number>): SizeDef[] {
  return SIZE_SPECS.filter((spec) => prices[spec.id] !== undefined).map((spec) => ({
    id: spec.id,
    width: spec.width,
    height: spec.height,
    unit: 'in',
    displayLabel: `${spec.width} × ${spec.height} in`,
    priceMinor: major(prices[spec.id]),
    glassSurchargeMinor: major(spec.glassSurcharge),
    matSurchargeMinor: major(spec.matSurcharge),
  }))
}

const GLASS_STANDARD_AND_PREMIUM = ['standard', 'premium']

function product(def: Omit<ProductDef, 'active' | 'glassOptionIds' | 'matOptionIds'> & Partial<ProductDef>): ProductDef {
  return { active: true, glassOptionIds: GLASS_STANDARD_AND_PREMIUM, matOptionIds: ['mat', 'none'], ...def }
}

export const SEED_CATALOG: Catalog = {
  // Overwritten by the server with a content hash; only a label in the bundled copy.
  version: 'bundled-seed',
  currency: 'INR',

  glassOptions: [
    { id: 'standard', name: 'Standard', description: 'Included', priced: false },
    { id: 'premium', name: 'Premium glass', description: 'Clearer, more premium finish', priced: true },
  ],

  matOptions: [
    { id: 'mat', name: 'With mat', description: 'A mat border around the photo', hasMat: true },
    { id: 'none', name: 'No mat', description: 'The photo runs to the frame edge', hasMat: false },
  ],

  delivery: {
    flatFeeMinor: major(149),
    freeAboveMinor: major(3000),
    note: 'Placeholder delivery charge — replace with your real policy.',
  },

  products: [
    product({
      id: 'natural-oak',
      name: 'Natural Oak',
      tagline: 'Light, natural grain',
      description: 'A light wood-look frame with a natural grain.',
      styleId: 'natural-oak',
      shipsWithMat: true,
      sizes: sizes({ '8x10': 449, '12x12': 549, '12x18': 649, '16x20': 799, '16x24': 949, '20x30': 1399, '24x36': 2049 }),
    }),
    product({
      id: 'walnut',
      name: 'Classic Walnut',
      tagline: 'Rich, warm wood',
      description: 'A dark, warm wood-look frame.',
      styleId: 'walnut',
      shipsWithMat: true,
      sizes: sizes({ '8x10': 499, '12x12': 599, '12x18': 699, '16x20': 849, '16x24': 999, '20x30': 1499, '24x36': 2199 }),
    }),
    product({
      id: 'matte-black',
      name: 'Matte Black',
      tagline: 'Slim and modern',
      description: 'A slim black frame with a matte finish.',
      styleId: 'matte-black',
      shipsWithMat: false,
      matOptionIds: ['none', 'mat'],
      sizes: sizes({ '8x10': 399, '12x12': 499, '12x18': 599, '16x20': 749, '16x24': 899, '20x30': 1299, '24x36': 1899 }),
    }),
    product({
      id: 'white',
      name: 'Gallery White',
      tagline: 'Clean, with a soft mat',
      description: 'A clean white frame, supplied with a mat.',
      styleId: 'white',
      shipsWithMat: true,
      sizes: sizes({ '8x10': 399, '12x12': 499, '12x18': 599, '16x20': 749, '16x24': 899, '20x30': 1299, '24x36': 1899 }),
    }),
    product({
      id: 'dark-brown',
      name: 'Dark Espresso',
      tagline: 'Deep, classic wood',
      description: 'A deep brown wood-look frame.',
      styleId: 'dark-brown',
      shipsWithMat: true,
      sizes: sizes({ '8x10': 499, '12x12': 599, '12x18': 699, '16x20': 849, '16x24': 999, '20x30': 1499, '24x36': 2199 }),
    }),
    product({
      id: 'gold',
      name: 'Antique Gold',
      tagline: 'A warm metallic accent',
      description: 'A gold-toned frame.',
      styleId: 'gold',
      shipsWithMat: true,
      sizes: sizes({ '8x10': 699, '12x12': 849, '12x18': 999, '16x20': 1249, '16x24': 1449, '20x30': 2099, '24x36': 2999 }),
    }),
  ],
}
