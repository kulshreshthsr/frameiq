import { useRef, useState, type DragEvent } from 'react'
import { useWallUpload } from '../../hooks/useWallUpload'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE_BYTES } from '../../lib/constants'

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
    <div className="flex w-full flex-col gap-3">
      <div
        className={`flex min-h-[300px] items-center justify-center rounded-[14px] border-[1.5px] border-dashed px-6 py-8 transition-[border-color,background-color] duration-150 ease-in-out max-[999px]:min-h-[240px] max-[999px]:px-4 max-[999px]:py-6 ${
          isDragActive ? 'border-ink bg-white' : error ? 'border-danger bg-card' : 'border-line-strong bg-card'
        }`}
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
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <span className="border-line-strong border-t-ink h-[26px] w-[26px] animate-spin-fast rounded-full border-[2.5px]" aria-hidden />
            <p className="font-serif text-[22px] leading-[1.2] font-medium text-ink max-[999px]:text-xl">Opening your photo…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <svg className="text-ink-3" width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
              <rect x="6" y="9" width="36" height="30" rx="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="17" cy="19" r="3.2" stroke="currentColor" strokeWidth="2" />
              <path d="M6 33l10-9 8 7 6-5 12 10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <p className="font-serif text-[22px] leading-[1.2] font-medium text-ink max-[999px]:text-xl">Start with a photo of your wall</p>
            <button type="button" className="btn btnPrimary" onClick={openPicker} data-testid="choose-wall">
              Choose a photo
            </button>
            <p className="text-sm text-ink-3">or drop one here</p>
            <p className="text-[12.5px] text-ink-3">JPG, PNG or WEBP · up to {Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="bg-danger-soft text-danger rounded-card border border-[#d9a79b] px-4 py-3 text-sm leading-[1.45]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
