import { create } from 'zustand'
import type { AdminCatalog } from '../../shared/admin'
import { adminApi } from './adminApi'

/** A shared cache of the admin catalog, so the catalog list, a product
 * editor and the bulk pricing tool all see the same (fresh) rowVersions
 * without each fetching it separately. Any successful mutation replaces it
 * wholesale with the server's response — the server's numbers are always
 * the ones kept, never a locally-guessed update. */
interface CatalogState {
  catalog: AdminCatalog | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
  setCatalog: (catalog: AdminCatalog) => void
}

export const useAdminCatalog = create<CatalogState>((set) => ({
  catalog: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const catalog = await adminApi.catalog()
      set({ catalog, loading: false })
    } catch {
      set({ loading: false, error: 'We couldn’t load the catalog. Please try again.' })
    }
  },

  setCatalog: (catalog) => set({ catalog, error: null }),
}))
