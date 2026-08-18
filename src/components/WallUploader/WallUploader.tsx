import { useRef, useState, type DragEvent } from 'react'
import { useWallUpload } from '../../hooks/useWallUpload'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE_BYTES } from '../../lib/constants'
import styles from './WallUploader.module.css'

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
    upload(e.dataTransfer.files?.[0])
  }

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropzone} ${isDragActive ? styles.active : ''} ${error ? styles.errored : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openPicker}
        role="button"
        tabIndex={0}
        aria-label="Upload a wall photo"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            upload(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {isLoading ? (
          <div className={styles.status}>
            <span className={styles.spinner} aria-hidden />
            <p className={styles.title}>Loading your photo…</p>
          </div>
        ) : (
          <div className={styles.status}>
            <svg
              className={styles.icon}
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M12 16V4M12 4L7 9M12 4l5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className={styles.title}>Drag &amp; drop a wall photo</p>
            <p className={styles.hint}>or click to browse</p>
            <p className={styles.formats}>
              JPG, PNG, WEBP · up to {Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
