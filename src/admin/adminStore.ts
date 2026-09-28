import { create } from 'zustand'
import type { AdminUser } from '../../shared/admin'
import { adminApi, isAdminApiError } from './adminApi'

/** Who's signed in, and to a real OWNER session or not. Checked once on
 * load; every admin page after that assumes `status === 'authed'`. */
interface AdminAuthState {
  status: 'checking' | 'authed' | 'anon'
  user: AdminUser | null
  error: string | null
  checkSession: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

export const useAdminAuth = create<AdminAuthState>((set) => ({
  status: 'checking',
  user: null,
  error: null,

  checkSession: async () => {
    try {
      const { user } = await adminApi.me()
      set({ status: 'authed', user, error: null })
    } catch {
      set({ status: 'anon', user: null })
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const { user } = await adminApi.login(email, password)
      set({ status: 'authed', user })
      return true
    } catch (error) {
      const message = isAdminApiError(error) && error.status === 401 ? 'Incorrect email or password.' : 'We couldn’t sign you in. Please try again.'
      set({ error: message })
      return false
    }
  },

  logout: async () => {
    try {
      await adminApi.logout()
    } catch {
      /* the session cookie is short-lived either way; treat the user as signed out */
    }
    set({ status: 'anon', user: null })
  },
}))
