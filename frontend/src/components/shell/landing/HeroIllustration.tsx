import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './HeroIllustration.module.css'

/**
 * The hero's visual argument, made without a single stock photo: an empty
 * wall on the left, the same wall with a gallery arrangement on the right,
 * with a draggable divider between them — the same "before / after" idiom
 * the real configurator uses to compare a design against the original room
 * (`CanvasStage/CompareReveal.tsx`), rebuilt here in plain SVG/CSS since the
 * hero has no canvas or composition store to attach to.
 *
 * Every shape draws on the same moulding-plus-mat-plus-highlight language
 * `FrameMoulding`/`GlassAndHighlight` use on the real canvas — not a replica
 * of that code, just the same visual grammar, so the illustration reads as
 * "this product" rather than generic clip-art.
 */

const FRAMES = [
  { x: 118, y: 96, w: 92, h: 118, tint: 'gold' as const },
  { x: 232, y: 128, w: 108, h: 82, tint: 'sage' as const },
  { x: 62, y: 232, w: 70, h: 90, tint: 'slate' as const, small: true },
]

function Frame({ x, y, w, h, tint }: { x: number; y: number; w: number; h: number; tint: 'gold' | 'sage' | 'slate' }) {
  const outer = 6
  const mat = 8
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#hero-frame-shadow)">
      <rect width={w} height={h} rx={1} fill="#4a3a2a" />
      {/* a thin lighter bevel along the top/left edge of the moulding, where
          the room's light would catch it — keeps the frame from reading as
          a flat rectangle */}
      <path d={`M0 0 L${w} 0 L${w - outer} ${outer} L${outer} ${outer} L${outer} ${h - outer} L0 ${h} Z`} fill="#6b5540" opacity={0.55} />
      <rect x={outer} y={outer} width={w - outer * 2} height={h - outer * 2} fill="#fffdf9" />
      <rect x={outer + mat} y={outer + mat} width={w - (outer + mat) * 2} height={h - (outer + mat) * 2} fill={`url(#hero-${tint})`} />
      <rect x={outer + mat} y={outer + mat} width={w - (outer + mat) * 2} height={(h - (outer + mat) * 2) * 0.4} fill="white" opacity={0.14} />
    </g>
  )
}

export function HeroIllustration() {
  const [reveal, setReveal] = useState(62) // percent shown of the "after" (right) side
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  const setFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setReveal(Math.min(96, Math.max(4, 100 - pct)))
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragging.current) setFromClientX(e.clientX)
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [setFromClientX])

  // The room itself (wall, floor, console) is identical on both sides of the
  // divider — only whether the frames are drawn differs. That's the entire
  // point being demonstrated, so getting this wrong (drawing frames on both
  // sides) would quietly turn the comparison into decoration.
  const room = (
    <>
      <rect width="420" height="340" fill="url(#hero-wall)" />
      {/* faint vertical wall panelling, so the wall reads as a real surface
          rather than a flat fill even before any frames are added */}
      <g opacity={0.4} stroke="#cabf9f" strokeWidth={1}>
        {Array.from({ length: 6 }, (_, i) => (76 + i * 56)).map((wx) => (
          <line key={wx} x1={wx} y1="0" x2={wx} y2="292" />
        ))}
      </g>
      <rect y="292" width="420" height="48" fill="url(#hero-floor)" />
      <line x1="0" y1="292" x2="420" y2="292" stroke="#00000018" strokeWidth={2} />
      {/* a console table, for scale and warmth */}
      <rect x="148" y="248" width="134" height="11" rx="2" fill="#7a6248" />
      <rect x="148" y="248" width="134" height="4" rx="2" fill="#8f7256" />
      <rect x="160" y="259" width="14" height="32" fill="#4a3a2a" />
      <rect x="256" y="259" width="14" height="32" fill="#4a3a2a" />
      <ellipse cx="205" cy="246" rx="16" ry="22" fill="#5c7350" />
      <ellipse cx="205" cy="246" rx="16" ry="22" fill="#00000012" />
      <rect x="199" y="266" width="12" height="18" fill="#8a6a48" />
    </>
  )

  // Rendered twice (the empty "before" layer and the framed "after"
  // overlay), so the gradients they share are defined ONCE, above, and only
  // referenced here — two <svg> elements each declaring the same ids would
  // be invalid, duplicate markup.
  const emptyWall = (
    <svg viewBox="0 0 420 340" className={styles.scene} aria-hidden focusable="false">
      {room}
    </svg>
  )
  const styledWall = (
    <svg viewBox="0 0 420 340" className={styles.scene} aria-hidden focusable="false">
      {room}
      {FRAMES.map((f) => (
        <Frame key={f.x} {...f} />
      ))}
    </svg>
  )

  return (
    <div className={styles.wrap}>
      <svg width="0" height="0" aria-hidden focusable="false">
        <defs>
          <linearGradient id="hero-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ece5d4" />
            <stop offset="1" stopColor="#ddd2bc" />
          </linearGradient>
          <linearGradient id="hero-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dccfae" />
            <stop offset="1" stopColor="#c9b98f" />
          </linearGradient>
          <linearGradient id="hero-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0b45c" />
            <stop offset="1" stopColor="#8a6d2a" />
          </linearGradient>
          <linearGradient id="hero-sage" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8a9b7a" />
            <stop offset="1" stopColor="#4f6146" />
          </linearGradient>
          <linearGradient id="hero-slate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7d97a0" />
            <stop offset="1" stopColor="#3d5066" />
          </linearGradient>
          <filter id="hero-frame-shadow" x="-40%" y="-30%" width="180%" height="180%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#15243a" floodOpacity="0.32" />
          </filter>
        </defs>
      </svg>
      <div className={styles.track} ref={trackRef}>
        <div className={styles.layer}>{emptyWall}</div>
        <div className={styles.layer} style={{ clipPath: `inset(0 0 0 ${100 - reveal}%)` }}>
          {styledWall}
          <span className={styles.tag} style={{ opacity: reveal > 30 ? 1 : 0 }}>
            Your wall, designed
          </span>
        </div>
        <span className={styles.tagBefore} style={{ opacity: reveal < 70 ? 1 : 0 }}>
          Your wall, today
        </span>
        <div
          className={styles.handle}
          style={{ left: `${100 - reveal}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Compare your wall before and after"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(reveal)}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            setFromClientX(e.clientX)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setReveal((r) => Math.max(4, r - 6))
            if (e.key === 'ArrowRight') setReveal((r) => Math.min(96, r + 6))
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <p className={styles.caption}>Drag to compare — this is the same view you’ll get with your own photo.</p>
    </div>
  )
}
