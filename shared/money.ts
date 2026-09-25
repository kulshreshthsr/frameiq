/**
 * All prices in the app are integers in the currency's minor unit (paise for
 * INR). Floats never touch money: sums and multiplications stay exact, and
 * conversion to a display string happens in exactly one place, below.
 */
export type Minor = number

export const CATALOG_CURRENCY = 'INR'
const MINOR_PER_MAJOR = 100

export function formatMoney(minor: Minor, currency: string = CATALOG_CURRENCY): string {
  const whole = minor % MINOR_PER_MAJOR === 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / MINOR_PER_MAJOR)
}

/** Whole major units → minor units (₹699 → 69900). Used by catalog data so
 * prices read the way a merchant writes them. */
export function major(amount: number): Minor {
  return Math.round(amount * MINOR_PER_MAJOR)
}
