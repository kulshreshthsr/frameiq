import { ACCEPTED_IMAGE_EXTENSIONS, ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE_BYTES } from './constants'

export interface ValidationResult {
  ok: boolean
  error?: string
}

export function validateImageFile(file: File): ValidationResult {
  if (file.size === 0) {
    return { ok: false, error: `"${file.name}" is empty and can't be used.` }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    const limitMb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
    return { ok: false, error: `"${file.name}" is ${sizeMb}MB — the limit is ${limitMb}MB.` }
  }

  const nameLower = file.name.toLowerCase()
  const hasAcceptedExtension = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => nameLower.endsWith(ext))
  const hasAcceptedMimeType = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)

  if (!hasAcceptedMimeType && !hasAcceptedExtension) {
    return { ok: false, error: `"${file.name}" isn't a supported format. Use JPG, PNG, or WEBP.` }
  }

  return { ok: true }
}
