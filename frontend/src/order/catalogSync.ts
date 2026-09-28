import { setCatalog } from '../domain/catalog'
import { api } from './api'

/**
 * Fetches the server's catalog and makes it the one the app uses. Until this
 * succeeds the app runs on the catalog bundled with it, so designing works
 * offline — but ORDERING requires the server's, because the server decides
 * what things cost.
 */
export async function syncCatalog(): Promise<boolean> {
  try {
    setCatalog(await api.catalog(), 'server')
    return true
  } catch {
    return false
  }
}

/** Like syncCatalog, but gives up after `ms` so a slow server can't hold up startup. */
export function syncCatalogWithin(ms: number): Promise<boolean> {
  return Promise.race([syncCatalog(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))])
}
