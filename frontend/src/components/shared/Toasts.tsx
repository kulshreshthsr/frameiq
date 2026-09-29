import { useEffect } from 'react'
import { useUIStore, type Notice } from '../../state/uiStore'

const LIFETIME_MS: Record<Notice['kind'], number> = { info: 6000, success: 4500, error: 9000 }

function Toast({ notice }: { notice: Notice }) {
  const dismiss = useUIStore((s) => s.dismissNotice)

  useEffect(() => {
    const timer = setTimeout(() => dismiss(notice.id), LIFETIME_MS[notice.kind])
    return () => clearTimeout(timer)
  }, [notice.id, notice.kind, dismiss])

  return (
    <div
      className={`shadow-lift rounded-card flex items-start gap-2.5 py-3 pr-2 pl-4 text-sm leading-snug text-paper ${notice.kind === 'error' ? 'bg-[#5a1f19]' : 'bg-ink'}`}
      // Errors interrupt; everything else waits its turn.
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      {/* A prefix in words, so meaning never depends on colour alone. */}
      <span className="flex-1 pt-0.5">
        {notice.kind === 'error' && <strong>Something went wrong. </strong>}
        {notice.message}
      </span>
      <button
        type="button"
        className="-mt-2 -mr-1 -mb-2 h-11 w-11 flex-none rounded-md border-none bg-transparent text-[22px] leading-none text-inherit opacity-85 hover:bg-white/12"
        onClick={() => dismiss(notice.id)}
        aria-label="Dismiss message"
      >
        ×
      </button>
    </div>
  )
}

export function Toasts() {
  const notices = useUIStore((s) => s.notices)
  if (notices.length === 0) return null
  return (
    <div className="fixed bottom-[calc(var(--spacing-safe)+96px)] left-1/2 z-50 flex w-[min(440px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2 max-[999px]:bottom-[calc(var(--spacing-safe)+88px)]">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} />
      ))}
    </div>
  )
}
