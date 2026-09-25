import { useRef, useState, type DragEvent } from 'react'
import { useWallUpload } from '../../hooks/useWallUpload'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE_BYTES } from '../../lib/constants'
import styles from './WallUploader.module.css'

/** The one thing a new visitor does first: give us a photo of their wall.
 * On a phone the picker offers the camera and the photo library. */
export function WallUploader() {
  const { upload, isLoading, error } = useWallUpload()
  const [isDragActive, setIsDragActive] = useState(false)
  const dragCounter = useRef(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const openPicker = () => {
    if (!isLoading) inputRef.current?.click()
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current += 1
    setIsDragActive(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragActive(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragActive(false)
    void upload(e.dataTransfer.files?.[0])
  }

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropzone} ${isDragActive ? styles.active : ''} ${error ? styles.errored : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          hidden
          aria-label="Choose a photo of your wall"
          data-testid="wall-input"
          onChange={(e) => {
            void upload(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {isLoading ? (
          <div className={styles.status} role="status">
            <span className={styles.spinner} aria-hidden />
            <p className={styles.title}>Opening your photo…</p>
          </div>
        ) : (
          <div className={styles.status}>
            <svg className={styles.icon} width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
              <rect x="6" y="9" width="36" height="30" rx="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="17" cy="19" r="3.2" stroke="currentColor" strokeWidth="2" />
              <path d="M6 33l10-9 8 7 6-5 12 10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <p className={styles.title}>Start with a photo of your wall</p>
            <button type="button" className="btn btnPrimary" onClick={openPicker} data-testid="choose-wall">
              Choose a photo
            </button>
            <p className={styles.hint}>or drop one here</p>
            <p className={styles.formats}>JPG, PNG or WEBP · up to {Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
