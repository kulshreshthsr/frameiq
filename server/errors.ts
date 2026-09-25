/**
 * Every failure a customer can meet is an AppError with a stable `code` (for
 * the app to react to), an HTTP status, and a `message` written for the
 * customer. Anything that is NOT an AppError is a bug or an outage: the
 * customer gets a generic message and a request id, while the real cause goes
 * to the log. Raw errors, stack traces and SQL never leave the server.
 */
export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const errors = {
  badRequest: (message: string, details?: unknown) => new AppError('BAD_REQUEST', 400, message, details),
  invalidOrder: (message: string, details?: unknown) => new AppError('INVALID_ORDER', 422, message, details),
  unauthorized: () => new AppError('UNAUTHORIZED', 401, 'We couldn’t verify that request.'),
  notFound: (what = 'That') => new AppError('NOT_FOUND', 404, `${what} wasn’t found.`),
  conflict: (code: string, message: string, details?: unknown) => new AppError(code, 409, message, details),
  tooLarge: (message: string) => new AppError('PAYLOAD_TOO_LARGE', 413, message),
  tooMany: () => new AppError('RATE_LIMITED', 429, 'You’re going a little fast. Please wait a moment and try again.'),
  unavailable: (message = 'This isn’t available right now. Please try again shortly.') => new AppError('UNAVAILABLE', 503, message),
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
