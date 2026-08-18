export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ACCEPTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const

export const MAX_FILE_SIZE_BYTES = 40 * 1024 * 1024

/** Long-edge cap for the in-app working copy. Keeps huge source photos from
 * hurting canvas performance without touching the original file. */
export const MAX_WORKING_DIMENSION = 6000

/** Workspace zoom bounds, expressed as a multiple of "fit to viewport". */
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 4
