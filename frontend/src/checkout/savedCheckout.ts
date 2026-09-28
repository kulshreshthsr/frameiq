/** The localStorage key checkout progress is saved under. Kept in its own tiny
 * module so the app shell can ask "is there a checkout to resume?" without
 * loading the checkout code (and its validation library) to find out. */
export const CHECKOUT_STORAGE_KEY = 'framengine.checkout'

export function hasSavedCheckout(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(CHECKOUT_STORAGE_KEY) !== null
  } catch {
    return false
  }
}
