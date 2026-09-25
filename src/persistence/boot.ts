import { syncCatalogWithin } from '../order/catalogSync'
import { useUIStore } from '../state/uiStore'
import { isPersistenceAvailable, restoreDraft, type RestoreOutcome } from './draftSync'

let booting: Promise<RestoreOutcome> | null = null

/**
 * Restores the saved draft exactly once per page load (React StrictMode runs
 * effects twice in development; without this a design would be restored, and
 * its images linked, twice) and tells the customer, in plain words, about
 * anything that didn't come back or can't be saved.
 */
export function bootDraft(): Promise<RestoreOutcome> {
  booting ??= (async () => {
    const ui = useUIStore.getState()

    // The server's catalog first, so a saved design is checked against what is really sold.
    // (If it's slow or unreachable, designing carries on with the bundled catalog.)
    await syncCatalogWithin(2500)

    if (!isPersistenceAvailable()) {
      ui.pushNotice('info', `This browser won't let us save your progress, so keep this tab open until you're done.`)
      return { status: 'none' } as const
    }

    const outcome = await restoreDraft()
    if (outcome.status === 'restored') {
      ui.pushNotice('success', 'Welcome back — we’ve restored your design.')
      if (outcome.missingPhotos > 0) {
        ui.pushNotice(
          'info',
          `${outcome.missingPhotos} photo${outcome.missingPhotos === 1 ? '' : 's'} couldn't be recovered. Add ${outcome.missingPhotos === 1 ? 'it' : 'them'} again in the Photos step.`,
        )
      }
    } else if (outcome.status === 'discarded') {
      ui.pushNotice('info', `We couldn't restore your last design, so we've started fresh.`)
    }
    return outcome
  })()
  return booting
}
