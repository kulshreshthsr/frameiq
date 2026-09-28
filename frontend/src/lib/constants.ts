export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ACCEPTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const

export const MAX_FILE_SIZE_BYTES = 40 * 1024 * 1024

/**
 * Long-edge caps for the in-app working copies. The canvas decodes every
 * image to raw RGBA (4 bytes/pixel), so a 6000 px phone photo costs ~100 MB
 * of memory each — a nine-frame wall would exhaust a phone. Editing never
 * needs that much: a frame photo is drawn at most ~1500 px wide even in a
 * full-size export. The original's pixel size is kept separately
 * (UploadedImage.sourceWidth) so print-quality checks still use the truth.
 */
export const MAX_WALL_DIMENSION = 4096
export const MAX_PHOTO_DIMENSION = 2560

export const MIN_WALL_DIMENSION = 640
export const MIN_PHOTO_DIMENSION = 200

/** Workspace zoom bounds, expressed as a multiple of "fit to viewport". */
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 4
