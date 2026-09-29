/**
 * Tailwind class strings shared across the admin tool's 9 pages (replaces
 * admin.module.css). A plain-values module rather than components, for the
 * same reason as the landing page's sectionStyles.ts: every page already
 * picks its own JSX structure and element types around these classes.
 *
 * Deliberately plain and dense — no serif headings, no editorial spacing.
 * This is a tool, not a showroom, matching the original stylesheet's own
 * stated intent.
 */

export const shell = 'flex h-dvh flex-col bg-paper-2 font-sans'
export const loadingScreen = 'flex h-dvh items-center justify-center text-ink-3'

// ---------------------------------------------------------------- nav
export const nav = 'flex min-h-14 flex-none items-center gap-1 overflow-x-auto bg-ink px-4 text-paper'
export const navBrand = 'mr-5 font-bold whitespace-nowrap'
export const navLink = 'rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap text-paper-2 no-underline hover:bg-white/8'
export const navLinkActive = 'rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap text-white no-underline bg-white/16'
export const navSpacer = 'flex-1'
export const navUser = 'mr-3 text-[13px] whitespace-nowrap text-paper-2'

// ------------------------------------------------------------ content
export const content = 'flex-1 overflow-y-auto p-6 max-[720px]:p-3'
export const page = 'mx-auto max-w-[1100px]'
export const pageHeader = 'mb-5 flex flex-wrap items-center justify-between gap-4'
export const pageTitle = 'm-0 text-[22px] font-bold'
export const pageActions = 'flex gap-2'
export const crumb = 'text-[13px] font-semibold text-ink-3 no-underline'

// ------------------------------------------------------ cards / grid
export const cardGrid = 'mb-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3'
export const statCard = 'rounded-card border-line border bg-card px-4 py-3.5'
export const statValue = 'text-[26px] leading-[1.1] font-bold'
export const statLabel = 'mt-1 text-[12.5px] text-ink-3'
export const panel = 'rounded-card border-line mb-5 border bg-card p-4'
export const panelTitle = 'mb-2.5 text-[15px] font-bold'

// ------------------------------------------------------------- table
// Below 720px the table becomes stacked cards — each <td> needs a
// data-label attribute, read back via the `content-[attr(data-label)]`
// pseudo-element (Tailwind v4's arbitrary content utility), same as the
// original `.table td::before { content: attr(data-label) }`.
export const table =
  'rounded-card border-line w-full border-collapse overflow-hidden border bg-card ' +
  'max-[720px]:block [&_thead]:max-[720px]:hidden [&_tbody]:max-[720px]:block [&_tr]:max-[720px]:block [&_th]:max-[720px]:block [&_td]:max-[720px]:block ' +
  '[&_tr]:max-[720px]:border-line [&_tr]:max-[720px]:border-b [&_tr]:max-[720px]:px-3 [&_tr]:max-[720px]:py-2.5 ' +
  '[&_td]:max-[720px]:flex [&_td]:max-[720px]:justify-between [&_td]:max-[720px]:gap-3 [&_td]:max-[720px]:border-none [&_td]:max-[720px]:px-0 [&_td]:max-[720px]:py-1 ' +
  "[&_td]:max-[720px]:before:content-[attr(data-label)] [&_td]:max-[720px]:before:text-[11.5px] [&_td]:max-[720px]:before:font-bold [&_td]:max-[720px]:before:text-ink-3 [&_td]:max-[720px]:before:uppercase"
export const tableTh = 'border-line bg-paper-2 text-ink-3 border-b px-3 py-2.5 text-left text-xs tracking-[0.04em] uppercase'
export const tableTd = 'border-line border-b px-3 py-2.5 align-middle text-sm [tr:last-child_&]:border-b-0'
export const numeric = 'text-right [font-variant-numeric:tabular-nums]'

export function badge(kind: 'active' | 'inactive' | 'paid' | 'pending' | 'failed') {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-bold tracking-[0.03em] uppercase'
  const byKind: Record<typeof kind, string> = {
    active: 'bg-[#e4ede0] text-ok',
    inactive: 'bg-paper-2 text-ink-3',
    paid: 'bg-[#e4ede0] text-ok',
    pending: 'bg-[#fbedd4] text-[#8a5b12]',
    failed: 'bg-danger-soft text-danger',
  }
  return `${base} ${byKind[kind]}`
}

export const rowLink = 'block text-inherit no-underline hover:underline'

// -------------------------------------------------------------- forms
export const form = 'flex max-w-[480px] flex-col gap-3.5'
export const field = 'flex flex-col gap-1'
export const fieldLabel = 'text-[13px] font-semibold text-ink-2'
export const inputBase = 'min-h-12 rounded-md border border-line-strong bg-white px-3 py-2.5 text-base text-ink'
export const textarea = `${inputBase} min-h-20 resize-y`
export const checkboxRow = 'flex items-center gap-2 text-sm'
export const checkboxInput = 'h-[18px] w-[18px]'
export const formError = 'm-0 text-[13.5px] text-danger'
export const hint = 'm-0 text-[13px] text-ink-3'
export const formActions = 'mt-1 flex gap-2.5'
export const priceInput = `${inputBase} w-[110px] text-right [font-variant-numeric:tabular-nums]`

// -------------------------------------------------------------- misc
export const toolbar = 'mb-3.5 flex flex-wrap items-center gap-2.5'
export const searchInput = `${inputBase} min-w-40 flex-1`
export const emptyState = 'px-4 py-10 text-center text-ink-3'

export function banner(kind: 'error' | 'success') {
  const base = 'mb-4 rounded-md px-3.5 py-2.5 text-sm'
  return kind === 'error' ? `${base} bg-danger-soft text-danger` : `${base} bg-[#e4ede0] text-ok`
}

export const loginScreen = 'flex min-h-dvh items-center justify-center bg-paper-2 p-4'
export const loginCard = 'rounded-card border-line shadow-soft w-full max-w-[360px] border bg-card px-6 py-7'
export const loginTitle = 'mb-1 text-xl font-bold'
export const loginSub = 'mb-5 text-[13.5px] text-ink-3'

export const historyList = 'flex max-h-[260px] flex-col gap-2 overflow-y-auto'
export const historyRow = 'border-line flex items-center justify-between gap-2.5 rounded-md border bg-white px-2.5 py-2 text-[13px]'
export const historyMeta = 'text-ink-3'
