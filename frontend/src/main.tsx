import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

/**
 * Two completely separate apps share this one entry point: the customer
 * configurator, and the owner admin area at `/admin`. Which one loads is
 * decided here, before either is imported — so a customer's browser never
 * downloads the admin bundle (or vice versa); Vite gives each dynamic
 * import its own chunk.
 *
 * The early `return` (no matching `else`) is deliberate: two structurally
 * identical `if`/`else` branches that each do only `import(x).then(render)`
 * are exactly the shape a minifier collapses into `import(cond ? a : b)` —
 * which then preloads (and, for CSS, actually applies) BOTH branches'
 * chunks on every load, defeating the whole point of the split. Keeping the
 * branches syntactically different (an early return, not an else) has been
 * verified to keep them separate through the production build; if you
 * touch this function, rebuild and check the network tab on `/admin` for
 * `App-*.css`/`App-*.js` — neither should load there.
 */
async function boot() {
  const root = createRoot(document.getElementById('root')!)
  const isAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')

  if (isAdmin) {
    const { default: AdminApp } = await import('./admin/AdminApp.tsx')
    root.render(
      <StrictMode>
        <AdminApp />
      </StrictMode>,
    )
    return
  }

  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
