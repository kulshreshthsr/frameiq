import { useEffect, useMemo, useState } from 'react'
import { formatMoney } from '../../shared/money'
import { MAX_PRICE_MINOR } from '../../shared/limits'
import { adminApi, isAdminApiError } from './adminApi'
import { useAdminCatalog } from './catalogStore'
import { Link } from './Link'
import styles from './admin.module.css'

interface Row {
  productId: string
  productName: string
  sizeId: string
  sizeLabel: string
  priceMinor: number
  rowVersion: number
  active: boolean
}

const key = (r: Pick<Row, 'productId' | 'sizeId'>) => `${r.productId}|${r.sizeId}`

/** Rounds a rupee amount to whole paise, the way every other price in the
 * app is stored — see shared/money.ts. */
const toMinor = (rupees: number) => Math.round(rupees * 100)

export function BulkPricingPage() {
  const catalog = useAdminCatalog((s) => s.catalog)
  const loading = useAdminCatalog((s) => s.loading)
  const load = useAdminCatalog((s) => s.load)
  const setCatalog = useAdminCatalog((s) => s.setCatalog)

  useEffect(() => {
    if (!catalog) void load()
  }, [catalog, load])

  const rows: Row[] = useMemo(() => {
    if (!catalog) return []
    return catalog.products.flatMap((p) => p.sizes.map((s) => ({ productId: p.id, productName: p.name, sizeId: s.id, sizeLabel: s.displayLabel, priceMinor: s.priceMinor, rowVersion: s.rowVersion, active: p.active && s.active })))
  }, [catalog])

  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent')
  const [sign, setSign] = useState<1 | -1>(1)
  const [amount, setAmount] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visible = useMemo(() => {
    let list = rows
    if (activeOnly) list = list.filter((r) => r.active)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((r) => r.productName.toLowerCase().includes(q) || r.sizeLabel.toLowerCase().includes(q))
    }
    return list
  }, [rows, activeOnly, query])

  const draftMinor = (row: Row): number => {
    const raw = drafts[key(row)]
    if (raw === undefined || raw === '') return row.priceMinor
    const n = Number(raw)
    return Number.isFinite(n) ? toMinor(n) : row.priceMinor
  }

  const changed = useMemo(() => rows.filter((r) => draftMinor(r) !== r.priceMinor), [rows, drafts]) // eslint-disable-line react-hooks/exhaustive-deps -- draftMinor is a pure function of `drafts`, which is already a dependency

  const toggleSelected = (k: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const selectAllVisible = () => setSelected(new Set(visible.map(key)))
  const clearSelection = () => setSelected(new Set())

  const applyAdjustmentPreview = () => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a positive amount for the adjustment.')
      return
    }
    setError(null)
    setDrafts((cur) => {
      const next = { ...cur }
      for (const row of visible) {
        if (!selected.has(key(row))) continue
        const delta = mode === 'percent' ? Math.round((row.priceMinor * value) / 100) : toMinor(value)
        const proposed = Math.max(0, row.priceMinor + sign * delta)
        next[key(row)] = (proposed / 100).toString()
      }
      return next
    })
  }

  const resetDrafts = () => {
    setDrafts({})
    setReviewing(false)
  }

  const apply = async () => {
    if (changed.length === 0) return
    setApplying(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await adminApi.bulkUpdatePrices({
        updates: changed.map((row) => ({ productId: row.productId, sizeId: row.sizeId, newPriceMinor: draftMinor(row), expectedVersion: row.rowVersion })),
      })
      setCatalog(updated)
      setNotice(`Updated ${changed.length} price${changed.length === 1 ? '' : 's'}.`)
      resetDrafts()
      setSelected(new Set())
    } catch (err) {
      if (isAdminApiError(err) && err.code === 'STALE_VERSION') {
        setError('Some of these changed elsewhere since you loaded this page. Nothing was applied — reloading the current prices.')
        void load()
        resetDrafts()
      } else {
        setError('Couldn’t apply those changes. Please try again.')
      }
    } finally {
      setApplying(false)
    }
  }

  if (loading && !catalog) return <p role="status">Loading…</p>
  if (!catalog) return null

  return (
    <div className={styles.page} data-testid="bulk-pricing-page">
      <div className={styles.pageHeader}>
        <div>
          <Link to="/admin/catalog" className={styles.crumb}>
            ‹ Catalog
          </Link>
          <h1 className={styles.pageTitle}>Bulk pricing</h1>
        </div>
      </div>

      {error && <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p>}
      {notice && <p className={`${styles.banner} ${styles.bannerSuccess}`}>{notice}</p>}

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Adjust selected prices</h2>
        <p className={styles.hint}>Tick rows below, choose an adjustment, and preview it before anything is saved.</p>
        <div className={styles.toolbar}>
          <select className={styles.select} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Adjustment type">
            <option value="percent">Percent</option>
            <option value="fixed">Fixed amount (₹)</option>
          </select>
          <select className={styles.select} value={sign} onChange={(e) => setSign(Number(e.target.value) as 1 | -1)} aria-label="Increase or decrease">
            <option value={1}>Increase by</option>
            <option value={-1}>Decrease by</option>
          </select>
          <input className={styles.input} style={{ width: 100 }} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === 'percent' ? '5' : '50'} data-testid="adjustment-amount" aria-label="Amount" />
          <span className={styles.hint}>{mode === 'percent' ? '%' : '₹'}</span>
          <button type="button" className="btn btnSecondary" onClick={applyAdjustmentPreview} disabled={selected.size === 0} data-testid="preview-adjustment">
            Preview on {selected.size} selected
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input className={`${styles.input} ${styles.searchInput}`} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Active only
        </label>
        <button type="button" className="btnText" onClick={selectAllVisible}>
          Select all shown
        </button>
        <button type="button" className="btnText" onClick={clearSelection}>
          Clear selection
        </button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th />
            <th>Product</th>
            <th>Size</th>
            <th className={styles.numeric}>Current</th>
            <th className={styles.numeric}>New price</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const k = key(row)
            const draft = drafts[k] ?? ''
            const isChanged = draftMinor(row) !== row.priceMinor
            return (
              <tr key={k} data-testid={`bulk-row-${row.productId}-${row.sizeId}`} style={isChanged ? { background: 'var(--accent-soft)' } : undefined}>
                <td data-label="">
                  <input type="checkbox" checked={selected.has(k)} onChange={() => toggleSelected(k)} aria-label={`Select ${row.productName} ${row.sizeLabel}`} />
                </td>
                <td data-label="Product">{row.productName}</td>
                <td data-label="Size">{row.sizeLabel}</td>
                <td className={styles.numeric} data-label="Current">
                  {formatMoney(row.priceMinor)}
                </td>
                <td className={styles.numeric} data-label="New price">
                  <input
                    className={`${styles.input} ${styles.priceInput}`}
                    type="number"
                    min="0"
                    step="1"
                    max={MAX_PRICE_MINOR / 100}
                    placeholder={(row.priceMinor / 100).toString()}
                    value={draft}
                    onChange={(e) => setDrafts((cur) => ({ ...cur, [k]: e.target.value }))}
                    data-testid={`new-price-${row.productId}-${row.sizeId}`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className={styles.panel}>
        <div className={styles.pageHeader} style={{ marginBottom: reviewing ? 12 : 0 }}>
          <h2 className={styles.panelTitle}>{changed.length} price{changed.length === 1 ? '' : 's'} changed</h2>
          <div className={styles.pageActions}>
            {changed.length > 0 && !reviewing && (
              <button type="button" className="btn btnSecondary" onClick={() => setReviewing(true)} data-testid="review-changes">
                Review changes
              </button>
            )}
            {reviewing && (
              <button type="button" className="btn btnPrimary" onClick={() => void apply()} disabled={applying} data-testid="apply-changes">
                {applying ? 'Applying…' : `Apply ${changed.length} change${changed.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
        {reviewing && (
          <table className={styles.table} data-testid="review-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Size</th>
                <th className={styles.numeric}>Current</th>
                <th className={styles.numeric}>New</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((row) => (
                <tr key={key(row)}>
                  <td data-label="Product">{row.productName}</td>
                  <td data-label="Size">{row.sizeLabel}</td>
                  <td className={styles.numeric} data-label="Current">
                    {formatMoney(row.priceMinor)}
                  </td>
                  <td className={styles.numeric} data-label="New">
                    {formatMoney(draftMinor(row))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
