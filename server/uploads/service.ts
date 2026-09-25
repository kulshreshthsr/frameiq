import { createHash } from 'node:crypto'
import { MAX_UPLOAD_BYTES } from '../../shared/limits.ts'
import type { AppContext } from '../context.ts'
import { isUniqueViolation, queryOne, run } from '../db/client.ts'
import { AppError, errors } from '../errors.ts'
import { EXTENSION_FOR, inspectImage, type ImageMime } from '../images/inspect.ts'

export interface UploadRecord {
  uploadId: string
  mime: ImageMime
  bytes: number
  width: number
  height: number
  storageKey: string
}

function toRecord(row: Record<string, unknown>): UploadRecord {
  return {
    uploadId: String(row.id),
    mime: String(row.mime) as ImageMime,
    bytes: Number(row.bytes),
    width: Number(row.width),
    height: Number(row.height),
    storageKey: String(row.storage_key),
  }
}

export async function getUpload(ctx: Pick<AppContext, 'db'>, uploadId: string): Promise<UploadRecord | null> {
  const row = await queryOne(ctx.db, 'SELECT * FROM uploads WHERE id = ?', [uploadId])
  return row ? toRecord(row as unknown as Record<string, unknown>) : null
}

/**
 * Accepts one image. What the file IS is decided from its bytes; the filename
 * and Content-Type the browser sent are ignored. Storage is content-addressed
 * (the id is derived from the SHA-256), so uploading the same file twice —
 * a retry after a dropped connection, say — is harmless and returns the
 * same id.
 */
export async function storeUpload(ctx: AppContext, bytes: Buffer): Promise<UploadRecord> {
  const limit = Math.min(ctx.config.maxUploadBytes, MAX_UPLOAD_BYTES)
  if (bytes.length === 0) throw new AppError('EMPTY_UPLOAD', 400, 'That file is empty.')
  if (bytes.length > limit) throw errors.tooLarge(`That image is larger than ${Math.round(limit / (1024 * 1024))} MB.`)

  const info = inspectImage(bytes)
  if (!info) throw new AppError('UNSUPPORTED_IMAGE', 422, 'That file isn’t a JPG, PNG or WEBP image we can read.')

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const uploadId = `up_${sha256.slice(0, 32)}`

  const existing = await getUpload(ctx, uploadId)
  if (existing) return existing

  const storageKey = `uploads/${sha256.slice(0, 2)}/${sha256}.${EXTENSION_FOR[info.mime]}`
  await ctx.storage.put(storageKey, bytes, info.mime)
  try {
    await run(ctx.db, 'INSERT INTO uploads (id, sha256, mime, bytes, width, height, storage_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      uploadId,
      sha256,
      info.mime,
      bytes.length,
      info.width,
      info.height,
      storageKey,
      ctx.now().toISOString(),
    ])
  } catch (error) {
    // A concurrent upload of the identical file won the race — that's fine.
    if (!isUniqueViolation(error)) throw error
    const winner = await getUpload(ctx, uploadId)
    if (winner) return winner
    throw error
  }
  ctx.log.event('upload.stored', { uploadId, mime: info.mime, bytes: bytes.length, width: info.width, height: info.height })
  return { uploadId, mime: info.mime, bytes: bytes.length, width: info.width, height: info.height, storageKey }
}
