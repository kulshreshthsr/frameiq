import { useMemo, useSyncExternalStore } from 'react'
import { useCompositionStore } from '../state/compositionStore'
import { buildQuote, type Quote } from '../domain/pricing'
import { catalogRevision, subscribeCatalog } from '../domain/catalog'

/** Re-renders when the catalog is replaced (e.g. the server's prices arrive). */
export function useCatalogRevision(): number {
  return useSyncExternalStore(subscribeCatalog, catalogRevision)
}

/** The live price of the current design — recomputed whenever a frame's
 * configuration or the catalog changes, so every place that shows a price agrees. */
export function useQuote(): Quote {
  const frames = useCompositionStore((s) => s.frames)
  const revision = useCatalogRevision()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the catalog's change signal
  return useMemo(() => buildQuote(frames), [frames, revision])
}
