import { ACCEPTED_IMAGE_EXTENSIONS, ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE_BYTES } from './constants'

export interface ValidationResult {
  ok: boolean
  error?: string
}

/** Cheap up-front checks on the File itself, before any decoding. Messages
 * are written for the customer, including what to do next. */
export function validateImageFile(file: File): ValidationResult {
  if (file.size === 0) {
    return { ok: false, error: `That file is empty. Please choose a different photo.` }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(0)
    const limitMb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
    return { ok: false, error: `That photo is ${sizeMb} MB — the limit is ${limitMb} MB. Try a smaller version of it.` }
  }

  const nameLower = file.name.toLowerCase()
  const hasAcceptedExtension = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => nameLower.endsWith(ext))
  const hasAcceptedMimeType = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)

  if (!hasAcceptedMimeType && !hasAcceptedExtension) {
    return { ok: false, error: `That file type isn't supported. Please use a JPG, PNG or WEBP photo.` }
  }

  return { ok: true }
}
