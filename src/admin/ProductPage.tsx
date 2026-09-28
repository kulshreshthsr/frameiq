import { useEffect, useMemo, useState } from 'react'
import { formatMoney } from '../../shared/money'
import { adminApi, isAdminApiError } from './adminApi'
import { useAdminCatalog } from './catalogStore'
import { Link } from './Link'
import { navigate } from './router'
import { PriceHistory } from './PriceHistory'
import styles from './admin.module.css'
import type { AdminProductView, AdminSizeView } from '../../shared/admin'

function friendlyError(error: unknown, fallback: string): string {
  if (isAdminApiError(error)) {
    if (error.code === 'STALE_VERSION') return 'This changed elsewhere since the page loaded. It has been refreshed — please try again.'
    if (error.code === 'DUPLICATE_ID') return error.message
    return error.message || fallback
  }
  return fallback
}

export function ProductPage({ id }: { id: string | null }) {
  const catalog = useAdminCatalog((s) => s.catalog)
  const load = useAdminCatalog((s) => s.load)

  useEffect(() => {
    if (!catalog) void load()
  }, [catalog, load])

  if (id === null) return <NewProductForm />
  if (!catalog) return <p role="status">Loading…</p>
  const product = catalog.products.find((p) => p.id === id)
  if (!product) return <p className={styles.emptyState}>No such product.</p>
  return <ExistingProduct product={product} glassOptions={catalog.glassOptions} matOptions={catalog.matOptions} />
}

// ---------------------------------------------------------------- create

function NewProductForm() {
  const setCatalog = useAdminCatalog((s) => s.setCatalog)
  const catalog = useAdminCatalog((s) => s.catalog)
  const [fields, setFields] = useState({ id: '', name: '', tagline: '', description: '', styleId: '', shipsWithMat: true })
  const [glass, setGlass] = useState<string[]>([])
  const [mat, setMat] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (glass.length === 0 || mat.length === 0) {
      setError('Offer at least one glass option and one mat option.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await adminApi.createProduct({ ...fields, glassOptionIds: glass, matOptionIds: mat })
      setCatalog(updated)
      navigate(`/admin/products/${fields.id}`)
    } catch (err) {
      setError(friendlyError(err, 'Couldn’t create that product.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <Link to="/admin/catalog" className={styles.crumb}>
            ‹ Catalog
          </Link>
          <h1 className={styles.pageTitle}>New product</h1>
        </div>
      </div>
      <p className={styles.hint} style={{ marginBottom: 16 }}>
        A new product starts inactive. Add at least one size, then activate it.
      </p>
      {error && <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>}
      <form className={styles.form} onSubmit={(e) => void submit(e)} data-testid="new-product-form">
        <div className={styles.field}>
          <label htmlFor="np-id">Product id (used in URLs, can’t change later)</label>
          <input id="np-id" className={styles.input} required pattern="[a-z][a-z0-9-]{1,39}" value={fields.id} onChange={(e) => setFields((f) => ({ ...f, id: e.target.value }))} data-testid="field-id" />
        </div>
        <div className={styles.field}>
          <label htmlFor="np-name">Name</label>
          <input id="np-name" className={styles.input} required value={fields.name} onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))} data-testid="field-name" />
        </div>
        <div className={styles.field}>
          <label htmlFor="np-tagline">Tagline</label>
          <input id="np-tagline" className={styles.input} required value={fields.tagline} onChange={(e) => setFields((f) => ({ ...f, tagline: e.target.value }))} />
        </div>
        <div className={styles.field}>
          <label htmlFor="np-desc">Description</label>
          <textarea id="np-desc" className={styles.textarea} required value={fields.description} onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className={styles.field}>
          <label htmlFor="np-style">Rendering style id</label>
          <input id="np-style" className={styles.input} required value={fields.styleId} onChange={(e) => setFields((f) => ({ ...f, styleId: e.target.value }))} />
        </div>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={fields.shipsWithMat} onChange={(e) => setFields((f) => ({ ...f, shipsWithMat: e.target.checked }))} />
          Ships with a mat by default
        </label>
        <fieldset>
          <legend>Glass options</legend>
          {(catalog?.glassOptions ?? []).map((g) => (
            <label key={g.id} className={styles.checkboxRow}>
              <input type="checkbox" checked={glass.includes(g.id)} onChange={(e) => setGlass((cur) => (e.target.checked ? [...cur, g.id] : cur.filter((x) => x !== g.id)))} />
              {g.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Mat options</legend>
          {(catalog?.matOptions ?? []).map((m) => (
            <label key={m.id} className={styles.checkboxRow}>
              <input type="checkbox" checked={mat.includes(m.id)} onChange={(e) => setMat((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id)))} />
              {m.name}
            </label>
          ))}
        </fieldset>
        <div className={styles.formActions}>
          <button type="submit" className="btn btnPrimary" disabled={busy} data-testid="create-product-submit">
            {busy ? 'Creating…' : 'Create product'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- edit

function ExistingProduct({ product, glassOptions, matOptions }: { product: AdminProductView; glassOptions: { id: string; name: string }[]; matOptions: { id: string; name: string }[] }) {
  const setCatalog = useAdminCatalog((s) => s.setCatalog)
  const load = useAdminCatalog((s) => s.load)
  const [fields, setFields] = useState({ name: product.name, tagline: product.tagline, description: product.description, styleId: product.styleId, shipsWithMat: product.shipsWithMat })
  const [glass, setGlass] = useState<string[]>(product.glassOptionIds)
  const [mat, setMat] = useState<string[]>(product.matOptionIds)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Keep the form in sync if the underlying product changes (e.g. a size
  // edit reloaded the catalog) without the owner having typed anything yet.
  useEffect(() => {
    setFields({ name: product.name, tagline: product.tagline, description: product.description, styleId: product.styleId, shipsWithMat: product.shipsWithMat })
    setGlass(product.glassOptionIds)
    setMat(product.matOptionIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, product.rowVersion])

  const saveFields = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await adminApi.updateProduct(product.id, { expectedVersion: product.rowVersion, ...fields, glassOptionIds: glass, matOptionIds: mat })
      setCatalog(updated)
      setNotice('Saved.')
    } catch (err) {
      setError(friendlyError(err, 'Couldn’t save that.'))
      if (isAdminApiError(err) && err.code === 'STALE_VERSION') void load()
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    setBusy(true)
    setError(null)
    try {
      if (!product.active && !product.sizes.some((s) => s.active)) {
        setError('Add or activate a size before activating this product.')
        return
      }
      setCatalog(await adminApi.updateProduct(product.id, { expectedVersion: product.rowVersion, active: !product.active }))
    } catch (err) {
      setError(friendlyError(err, 'Couldn’t change that.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page} data-testid="product-page">
      <div className={styles.pageHeader}>
        <div>
          <Link to="/admin/catalog" className={styles.crumb}>
            ‹ Catalog
          </Link>
          <h1 className={styles.pageTitle}>{product.name}</h1>
        </div>
        <div className={styles.pageActions}>
          <span className={`${styles.badge} ${product.active ? styles.badgeActive : styles.badgeInactive}`}>{product.active ? 'Active' : 'Inactive'}</span>
          <button type="button" className="btn btnSecondary" onClick={() => void toggleActive()} disabled={busy} data-testid="toggle-active">
            {product.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {error && <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>}
      {notice && <p className={`${styles.banner} ${styles.bannerSuccess}`}>{notice}</p>}

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Details</h2>
        <form className={styles.form} onSubmit={(e) => void saveFields(e)}>
          <div className={styles.field}>
            <label htmlFor="pf-name">Name</label>
            <input id="pf-name" className={styles.input} value={fields.name} onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))} data-testid="field-name" />
          </div>
          <div className={styles.field}>
            <label htmlFor="pf-tagline">Tagline</label>
            <input id="pf-tagline" className={styles.input} value={fields.tagline} onChange={(e) => setFields((f) => ({ ...f, tagline: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="pf-desc">Description</label>
            <textarea id="pf-desc" className={styles.textarea} value={fields.description} onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={fields.shipsWithMat} onChange={(e) => setFields((f) => ({ ...f, shipsWithMat: e.target.checked }))} />
            Ships with a mat by default
          </label>
          <fieldset>
            <legend>Glass</legend>
            {glassOptions.map((g) => (
              <label key={g.id} className={styles.checkboxRow}>
                <input type="checkbox" checked={glass.includes(g.id)} onChange={(e) => setGlass((cur) => (e.target.checked ? [...cur, g.id] : cur.filter((x) => x !== g.id)))} />
                {g.name}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Mat</legend>
            {matOptions.map((m) => (
              <label key={m.id} className={styles.checkboxRow}>
                <input type="checkbox" checked={mat.includes(m.id)} onChange={(e) => setMat((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id)))} />
                {m.name}
              </label>
            ))}
          </fieldset>
          <div className={styles.formActions}>
            <button type="submit" className="btn btnPrimary" disabled={busy} data-testid="save-product">
              Save changes
            </button>
          </div>
        </form>
      </div>

      <SizesPanel product={product} />
    </div>
  )
}

// ---------------------------------------------------------------- sizes

function SizesPanel({ product }: { product: AdminProductView }) {
  const setCatalog = useAdminCatalog((s) => s.setCatalog)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sizes = useMemo(() => [...product.sizes].sort((a, b) => a.priceMinor - b.priceMinor), [product.sizes])

  return (
    <div className={styles.panel}>
      <div className={styles.pageHeader} style={{ marginBottom: 12 }}>
        <h2 className={styles.panelTitle}>Sizes</h2>
        <button type="button" className="btnText" onClick={() => setAdding((a) => !a)} data-testid="add-size-toggle">
          {adding ? 'Cancel' : '+ Add size'}
        </button>
      </div>
      {error && <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>}
      {adding && <AddSizeForm productId={product.id} onDone={() => setAdding(false)} onError={setError} />}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Size</th>
            <th className={styles.numeric}>Price</th>
            <th className={styles.numeric}>Glass surcharge</th>
            <th className={styles.numeric}>Mat surcharge</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sizes.map((size) => (
            <SizeRow key={size.id} productId={product.id} size={size} onError={setError} onHistory={() => setHistoryFor(size.id)} />
          ))}
        </tbody>
      </table>

      {historyFor && (
        <PriceHistory
          productId={product.id}
          sizeId={historyFor}
          currentRowVersion={product.sizes.find((s) => s.id === historyFor)?.rowVersion ?? 0}
          onClose={() => setHistoryFor(null)}
          onReverted={(catalog) => setCatalog(catalog)}
        />
      )}
    </div>
  )
}

function AddSizeForm({ productId, onDone, onError }: { productId: string; onDone: () => void; onError: (message: string | null) => void }) {
  const setCatalog = useAdminCatalog((s) => s.setCatalog)
  const [fields, setFields] = useState({ id: '', width: '', height: '', displayLabel: '', priceMinor: '', glassSurchargeMinor: '0', matSurchargeMinor: '0' })
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    onError(null)
    try {
      const updated = await adminApi.createSize(productId, {
        id: fields.id,
        width: Number(fields.width),
        height: Number(fields.height),
        displayLabel: fields.displayLabel,
        priceMinor: Math.round(Number(fields.priceMinor) * 100),
        glassSurchargeMinor: Math.round(Number(fields.glassSurchargeMinor) * 100),
        matSurchargeMinor: Math.round(Number(fields.matSurchargeMinor) * 100),
      })
      setCatalog(updated)
      onDone()
    } catch (err) {
      onError(friendlyError(err, 'Couldn’t add that size.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} data-testid="add-size-form">
      <div className={styles.field}>
        <label htmlFor="as-id">Size id</label>
        <input id="as-id" className={styles.input} required value={fields.id} onChange={(e) => setFields((f) => ({ ...f, id: e.target.value }))} data-testid="size-id" />
      </div>
      <div className={styles.field}>
        <label htmlFor="as-label">Display label</label>
        <input id="as-label" className={styles.input} required placeholder="8 × 10 in" value={fields.displayLabel} onChange={(e) => setFields((f) => ({ ...f, displayLabel: e.target.value }))} />
      </div>
      <div className={styles.field}>
        <label htmlFor="as-width">Width (in, portrait)</label>
        <input id="as-width" className={styles.input} type="number" min="0" step="0.1" required value={fields.width} onChange={(e) => setFields((f) => ({ ...f, width: e.target.value }))} />
      </div>
      <div className={styles.field}>
        <label htmlFor="as-height">Height (in, portrait)</label>
        <input id="as-height" className={styles.input} type="number" min="0" step="0.1" required value={fields.height} onChange={(e) => setFields((f) => ({ ...f, height: e.target.value }))} />
      </div>
      <div className={styles.field}>
        <label htmlFor="as-price">Price (₹)</label>
        <input id="as-price" className={styles.input} type="number" min="0" step="1" required value={fields.priceMinor} onChange={(e) => setFields((f) => ({ ...f, priceMinor: e.target.value }))} data-testid="size-price" />
      </div>
      <div className={styles.formActions}>
        <button type="submit" className="btn btnPrimary" disabled={busy} data-testid="add-size-submit">
          Add size
        </button>
      </div>
    </form>
  )
}

function SizeRow({ productId, size, onError, onHistory }: { productId: string; size: AdminSizeView; onError: (m: string | null) => void; onHistory: () => void }) {
  const setCatalog = useAdminCatalog((s) => s.setCatalog)
  const load = useAdminCatalog((s) => s.load)
  const [price, setPrice] = useState(String(size.priceMinor / 100))
  const [saving, setSaving] = useState(false)
  const dirty = Number(price) * 100 !== size.priceMinor

  useEffect(() => setPrice(String(size.priceMinor / 100)), [size.priceMinor])

  const save = async () => {
    setSaving(true)
    onError(null)
    try {
      const updated = await adminApi.updateSize(productId, size.id, { expectedVersion: size.rowVersion, priceMinor: Math.round(Number(price) * 100) })
      setCatalog(updated)
    } catch (err) {
      onError(friendlyError(err, 'Couldn’t save that price.'))
      if (isAdminApiError(err) && err.code === 'STALE_VERSION') void load()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    setSaving(true)
    onError(null)
    try {
      const updated = await adminApi.updateSize(productId, size.id, { expectedVersion: size.rowVersion, active: !size.active })
      setCatalog(updated)
    } catch (err) {
      onError(friendlyError(err, 'Couldn’t change that.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr data-testid={`size-row-${size.id}`}>
      <td data-label="Size">{size.displayLabel}</td>
      <td className={styles.numeric} data-label="Price">
        <input
          className={`${styles.input} ${styles.priceInput}`}
          type="number"
          min="0"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          aria-label={`Price for ${size.displayLabel}`}
          data-testid={`price-input-${size.id}`}
        />
        {dirty && (
          <button type="button" className="btnText" onClick={() => void save()} disabled={saving} data-testid={`save-price-${size.id}`}>
            Save
          </button>
        )}
      </td>
      <td className={styles.numeric} data-label="Glass surcharge">
        {formatMoney(size.glassSurchargeMinor)}
      </td>
      <td className={styles.numeric} data-label="Mat surcharge">
        {formatMoney(size.matSurchargeMinor)}
      </td>
      <td data-label="Status">
        <span className={`${styles.badge} ${size.active ? styles.badgeActive : styles.badgeInactive}`}>{size.active ? 'Active' : 'Inactive'}</span>
      </td>
      <td data-label="">
        <button type="button" className="btnText" onClick={toggleActive} disabled={saving} data-testid={`toggle-size-${size.id}`}>
          {size.active ? 'Deactivate' : 'Activate'}
        </button>
        <button type="button" className="btnText" onClick={onHistory} data-testid={`history-${size.id}`}>
          History
        </button>
      </td>
    </tr>
  )
}
