import { useSyncExternalStore } from 'react'

/**
 * The admin area's own tiny router. The project has no routing library
 * (the customer app just switches on a couple of booleans), and seven admin
 * screens don't earn one either — this is `pushState` + a path parser.
 */

export type AdminRoute =
  | { name: 'login' }
  | { name: 'dashboard' }
  | { name: 'catalog' }
  | { name: 'bulk' }
  | { name: 'newProduct' }
  | { name: 'product'; id: string }
  | { name: 'orders' }
  | { name: 'order'; id: string }
  | { name: 'notFound'; path: string }

export function parseAdminPath(pathname: string): AdminRoute {
  const parts = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'dashboard' }
  if (parts[0] === 'login') return { name: 'login' }
  if (parts[0] === 'catalog' && parts.length === 1) return { name: 'catalog' }
  if (parts[0] === 'catalog' && parts[1] === 'bulk') return { name: 'bulk' }
  if (parts[0] === 'products' && parts[1] === 'new') return { name: 'newProduct' }
  if (parts[0] === 'products' && parts[1]) return { name: 'product', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'orders' && parts.length === 1) return { name: 'orders' }
  if (parts[0] === 'orders' && parts[1]) return { name: 'order', id: decodeURIComponent(parts[1]) }
  return { name: 'notFound', path: pathname }
}

const listeners = new Set<() => void>()
window.addEventListener('popstate', () => listeners.forEach((l) => l()))

export function navigate(path: string): void {
  if (window.location.pathname === path) return
  window.history.pushState(null, '', path)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAdminRoute(): AdminRoute {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/admin',
  )
  return parseAdminPath(pathname)
}
