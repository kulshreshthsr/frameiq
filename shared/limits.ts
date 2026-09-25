/**
 * Limits that the browser and the server must agree on. They live in one
 * place so a rule the UI enforces to be helpful is the same rule the server
 * enforces to be safe.
 */

export const MIN_WALL_WIDTH_CM = 60
export const MAX_WALL_WIDTH_CM = 1500

/** Most frames a single design may hold. */
export const MAX_FRAMES = 24

/**
 * Minimum pixels-per-inch a photo must reach at its printed size before an
 * order for it can be confirmed. Below this a print visibly softens; the
 * product owner should change this number deliberately, not by accident.
 */
export const MIN_PRODUCTION_PPI = 100

/** Largest single image the server accepts (matches the browser's own cap). */
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024

/** Aspect ratio of an ORIGINAL may differ from the editing copy it was
 * cropped from by at most this much (rounding, resampling). */
export const MAX_ASPECT_DRIFT = 0.015
