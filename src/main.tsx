import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

/**
 * Two completely separate apps share this one entry point: the customer
 * configurator, and the owner admin area at `/admin`. Which one loads is
 * decided here, before either is imported — so a customer's browser never
 * downloads the admin bundle (or vice versa); Vite gives each dynamic
 * import its own chunk.
 */
const isAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')

const root = createRoot(document.getElementById('root')!)

const render = (Component: React.ComponentType) =>
  root.render(
    <StrictMode>
      <Component />
    </StrictMode>,
  )

if (isAdmin) {
  void import('./admin/AdminApp.tsx').then((m) => render(m.default))
} else {
  void import('./App.tsx').then((m) => render(m.default))
}
