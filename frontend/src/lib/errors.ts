/**
 * An error whose message is written for the customer and safe to display.
 * Anything that is NOT a UserFacingError (a TypeError, a DOMException, a
 * browser internals message) must never reach the UI verbatim —
 * `friendlyMessage` swaps it for a calm generic line instead.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export function friendlyMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof UserFacingError ? error.message : fallback
}
