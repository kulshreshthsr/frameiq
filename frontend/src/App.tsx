import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { CanvasStageHandle } from './components/CanvasStage/CanvasStage'
import { useCompositionStore } from './state/compositionStore'
import { useJourneyStore } from './state/journeyStore'
import { useUIStore } from './state/uiStore'
import { bootDraft } from './persistence/boot'
import { startDraftAutosave, startNewDesign } from './persistence/draftSync'
import { friendlyMessage } from './lib/errors'
import { describeReduction } from './lib/exportSafety'
import { Header } from './components/shell/Header'
import { Landing } from './components/shell/Landing'
import { Dialog } from './components/shared/Dialog'
import { Toasts } from './components/shared/Toasts'
import { useCheckoutStore } from './checkout/checkoutStore'
import { hasSavedCheckout } from './checkout/savedCheckout'
import './App.css'

// The editor (and Konva with it) is the heaviest part of the app. Loading it
// on demand keeps the first screen — the upload prompt — fast on a phone.
const loadWorkspace = () => import('./components/shell/Workspace')
const Workspace = lazy(loadWorkspace)

// Checkout is a separate chunk too: most visitors are still designing.
const loadCheckout = () => import('./checkout/CheckoutFlow').then((m) => ({ default: m.CheckoutFlow }))
const CheckoutFlow = lazy(loadCheckout)

// Developer tooling exists only in development builds. Because the condition
// is a build-time constant, production bundlers drop this import entirely.
const DevTools = import.meta.env.DEV ? lazy(() => import('./components/dev/DevTools')) : null

function supportsCanvas(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('2d'))
  } catch {
    return false
  }
}

function Unsupported() {
  return (
    <main className="stateScreen" role="alert">
      <h1>This browser can’t run the frame designer</h1>
      <p>Please try the latest version of Chrome, Safari, Edge or Firefox.</p>
    </main>
  )
}

/** A link to an existing order: /order/FRM-2026-000123?t=<private token>. */
function orderLinkFromLocation(): { publicOrderId: string; token: string } | null {
  const match = /^\/order\/(FRM-\d{4}-\d{6,})\/?$/.exec(window.location.pathname)
  const token = new URLSearchParams(window.location.search).get('t')
  return match && token ? { publicOrderId: match[1], token } : null
}

function App() {
  const canvasStageRef = useRef<CanvasStageHandle | null>(null)
  const wall = useCompositionStore((s) => s.wall)
  const isFullscreenPreview = useJourneyStore((s) => s.isFullscreenPreview)
  const exitFullscreenPreview = useJourneyStore((s) => s.exitFullscreenPreview)
  const checkoutActive = useCheckoutStore((s) => s.active)
  const [isReady, setIsReady] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isPreparingOrder, setIsPreparingOrder] = useState(false)
  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const [canvasOk] = useState(supportsCanvas)

  // Restore the saved design, pick up any checkout in progress, then start
  // saving. Restoring first means an empty startup state can never overwrite
  // something recoverable.
  useEffect(() => {
    let stopAutosave = () => {}
    let cancelled = false
    void (async () => {
      await bootDraft()
      if (cancelled) return
      // Checkout code is only loaded if there is a checkout to pick up.
      const link = orderLinkFromLocation()
      if (link || hasSavedCheckout()) {
        const flow = await import('./checkout/flow')
        if (link) await flow.openOrderFromLink(link.publicOrderId, link.token)
        else await flow.resumeCheckout()
      }
      if (cancelled) return
      setIsReady(true)
      stopAutosave = startDraftAutosave()
    })()
    return () => {
      cancelled = true
      stopAutosave()
    }
  }, [])

  // Save checkout progress for as long as checkout is open.
  useEffect(() => {
    if (!checkoutActive) return
    let stop = () => {}
    let cancelled = false
    void import('./checkout/checkoutPersistence').then((m) => {
      if (!cancelled) stop = m.startCheckoutAutosave()
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [checkoutActive])

  // Begin fetching the editor while the customer is still choosing a photo.
  useEffect(() => {
    void loadWorkspace()
  }, [])

  useEffect(() => {
    if (!isFullscreenPreview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreenPreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreenPreview, exitFullscreenPreview])

  const handleExport = async () => {
    if (isExporting) return
    setIsExporting(true)
    const ui = useUIStore.getState()
    try {
      const result = await canvasStageRef.current?.exportImage()
      if (result) ui.pushNotice('success', describeReduction(result) ?? 'Your image has been saved.')
    } catch (error) {
      ui.pushNotice('error', friendlyMessage(error, `We couldn't save the image. Please try again.`))
    } finally {
      setIsExporting(false)
    }
  }

  /** "Continue to order": freeze the design and open checkout. */
  const handleOrder = async () => {
    if (isPreparingOrder) return
    setIsPreparingOrder(true)
    void loadCheckout() // warm the checkout chunk while the preview renders
    try {
      const stage = canvasStageRef.current
      const { beginCheckout } = await import('./checkout/flow')
      const result = await beginCheckout(async () => {
        if (!stage) throw new Error('canvas not ready')
        return (await stage.renderImage()).blob
      })
      if (!result.ok) useUIStore.getState().pushNotice('error', result.message)
    } finally {
      setIsPreparingOrder(false)
    }
  }

  const handleStartOver = async () => {
    setConfirmingStartOver(false)
    await startNewDesign()
  }

  if (!canvasOk) return <Unsupported />

  if (!isReady) {
    return (
      <div className="stateScreen" role="status">
        <p>Restoring your design…</p>
      </div>
    )
  }

  // While ordering, the design is frozen and the editor steps aside.
  if (checkoutActive) {
    return (
      <div className="app">
        <Suspense
          fallback={
            <div className="stateScreen" role="status">
              <p>Opening checkout…</p>
            </div>
          }
        >
          <CheckoutFlow />
        </Suspense>
        <Toasts />
      </div>
    )
  }

  return (
    <div className={`app ${isFullscreenPreview ? 'appFullscreen' : ''}`}>
      {!isFullscreenPreview && <Header hasDesign={Boolean(wall)} onStartOver={() => setConfirmingStartOver(true)} />}

      {wall ? (
        <Suspense
          fallback={
            <div className="canvasLoading" role="status">
              Loading your wall…
            </div>
          }
        >
          <Workspace ref={canvasStageRef} onExport={() => void handleExport()} isExporting={isExporting} onOrder={() => void handleOrder()} isPreparingOrder={isPreparingOrder} />
        </Suspense>
      ) : (
        <Landing />
      )}

      <Toasts />

      <Dialog open={confirmingStartOver} title="Start a new design?" onClose={() => setConfirmingStartOver(false)}>
        <h2 className="dialogTitle">Start a new design?</h2>
        <p className="dialogText">This clears your wall photo, your photos and your layout. It can’t be undone.</p>
        <div className="dialogActions">
          <button type="button" className="btn btnSecondary" onClick={() => setConfirmingStartOver(false)}>
            Keep designing
          </button>
          <button type="button" className="btn btnPrimary" onClick={() => void handleStartOver()} data-testid="confirm-start-over">
            Start over
          </button>
        </div>
      </Dialog>

      {DevTools && (
        <Suspense fallback={null}>
          <DevTools />
        </Suspense>
      )}
    </div>
  )
}

export default App
