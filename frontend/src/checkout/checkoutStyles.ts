/**
 * Tailwind class strings shared across checkout's 10 components (replaces
 * checkout.module.css, 869 lines — the largest CSS Module in the app). Same
 * plain-values rationale as sectionStyles.ts/adminStyles.ts.
 */

export const checkout = 'flex h-dvh flex-col bg-paper'

// -------------------------------------------------------------- layout
// .page/.pageNarrow together control the two-column desktop grid (main +
// sticky summary) collapsing to a single stacked column on phones, where
// the summary also switches from `position: sticky` to `static` and moves
// above the form (`order: -1`).
const pageBase =
  'flex-1 min-h-0 overflow-y-auto grid justify-center items-start gap-14 px-6 pt-10 pb-12 ' +
  'max-[999px]:flex max-[999px]:flex-col max-[999px]:items-stretch max-[999px]:justify-start max-[999px]:gap-4 max-[999px]:px-4 max-[999px]:pt-4 max-[999px]:pb-0'
export const page = `${pageBase} grid-cols-[minmax(0,620px)_minmax(0,400px)] [grid-template-areas:'main_summary']`
export const pageNarrow = `${pageBase} grid-cols-[minmax(0,680px)] [grid-template-areas:'main']`
export const main = "[grid-area:main] min-w-0 max-[999px]:w-full max-[999px]:max-w-[640px] max-[999px]:mx-auto max-[999px]:flex-1 max-[999px]:flex max-[999px]:flex-col"
export const summary = "[grid-area:summary] sticky top-0 self-start max-[999px]:static max-[999px]:order-first max-[999px]:w-full max-[999px]:max-w-[640px] max-[999px]:mx-auto"

export const stage = 'flex flex-col gap-5'
export const stageTitle = 'font-serif text-[34px] leading-[1.12] font-medium tracking-[-0.015em] max-[999px]:text-[28px]'
export const stageLead = 'text-ink-2 -mt-2 text-base leading-[1.5] max-[999px]:text-[15px]'
export const sectionHeading = 'mb-2.5 text-[13px] font-bold tracking-[0.06em] text-ink uppercase'
export const softNote = 'text-ink-3 text-[13.5px] leading-[1.5]'

// ------------------------------------------------------------- summary
export const summaryDesktop = 'rounded-xl border-line border bg-card p-6 max-[999px]:hidden'
export const summaryHeading = 'mb-4 font-serif text-[22px] font-medium'
export const summaryPreview = 'mb-4 block h-auto w-full rounded-lg bg-paper-2 object-cover'
export const summaryLines = 'm-0 list-none p-0'
export const summaryLine = 'border-line flex justify-between gap-3 border-b py-2.5 text-[14.5px] font-semibold'
export const summaryQty = 'text-ink-3'
export const summaryDetail = 'text-ink-3 block text-[13px] font-medium'
export const summaryAmount = 'flex-none [font-variant-numeric:tabular-nums]'
export const summaryTotalRow = 'flex justify-between py-1 text-[14.5px] text-ink-2 [&>dt]:m-0 [&>dd]:m-0'
export const summaryGrandRow = 'border-line-strong mt-1.5 flex items-baseline justify-between border-t pt-3 text-ink [&>dt]:m-0 [&>dd]:m-0'
export const summaryGrandDt = 'text-[13px] font-bold tracking-[0.06em] uppercase'
export const summaryGrandDd = 'font-serif text-[26px] font-semibold [font-variant-numeric:lining-nums_tabular-nums]'
export const summaryDestination = 'mt-3 text-[13px] text-ink-3'
export const summaryOrder = 'mt-3 text-[13px] text-ink-3'

// Mobile-only collapsed summary (a <details>, hidden entirely on desktop).
export const summaryDetails = 'hidden max-[999px]:block max-[999px]:rounded-xl max-[999px]:border max-[999px]:border-line max-[999px]:bg-card'
export const summaryToggle =
  "group flex min-h-13 list-none cursor-pointer items-center justify-between px-4 text-sm font-semibold " +
  "[&::-webkit-details-marker]:hidden after:ml-2.5 after:text-ink-3 after:content-['▾'] group-open:after:content-['▴']"
export const summaryToggleLabel = 'min-w-0 flex-1'
export const summaryToggleTotal = 'ml-3 font-serif text-lg [font-variant-numeric:lining-nums]'
export const summaryBody = 'px-4 pb-4'

// --------------------------------------------------------------- review
export const previewImage = 'shadow-soft block h-auto w-full rounded-card bg-paper-2'
export const frameList = 'm-0 list-none rounded-card border-line border bg-white p-0'
export const frameRow = 'border-line flex items-center gap-3.5 border-b px-4 py-3 last:border-b-0'
export const frameNumber = 'flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-paper-2 text-[13px] font-bold'
export const frameWhat = 'flex flex-col text-[15px]'
export const frameMeta = 'text-ink-3 text-[13.5px]'
export const problem = 'rounded-card bg-danger-soft border border-[#d9a79b] p-4'
export const problemTitle = 'text-danger font-bold'
export const problemBody = 'text-ink-2 mt-1 text-[14.5px]'
export const problemActions = 'mt-3 flex flex-wrap items-center gap-3'

// ---------------------------------------------------------------- forms
export const form = 'flex flex-col gap-4.5'
export const formRow = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3.5 max-[999px]:grid-cols-1'
export const field = 'flex min-w-0 flex-col gap-1.5'
export const label = 'text-sm font-semibold text-ink'
export const optional = 'font-medium text-ink-3'
// 16px stops iOS zooming the page when a field is focused.
export const input =
  'w-full min-h-13 rounded-lg border border-line-strong bg-white px-3.5 text-base text-ink transition-[border-color,box-shadow] duration-150 ease-in-out ' +
  'focus:border-ink focus:shadow-[0_0_0_1px_var(--color-ink)] focus:outline-none aria-invalid:border-danger aria-invalid:shadow-[0_0_0_1px_var(--color-danger)]'
export const select =
  'appearance-none bg-[length:5px_5px] bg-no-repeat pr-10 ' +
  '[background-image:linear-gradient(45deg,transparent_50%,var(--color-ink-2)_50%),linear-gradient(135deg,var(--color-ink-2)_50%,transparent_50%)] ' +
  '[background-position:calc(100%-20px)_50%,calc(100%-15px)_50%]'
export const errorText = 'text-danger flex gap-1.5 text-[13.5px] leading-snug'
export const hintText = 'text-ink-3 text-[13.5px] leading-snug'

// ------------------------------------------------------------- actions
// The sticky mobile action bar: total on the left, the one primary button
// always in reach on the right.
export const actions =
  'mt-2 flex items-center justify-end gap-4 ' +
  'max-[999px]:sticky max-[999px]:bottom-0 max-[999px]:z-[5] max-[999px]:-mx-4 max-[999px]:mt-auto max-[999px]:border-t max-[999px]:border-line max-[999px]:bg-card ' +
  'max-[999px]:px-4 max-[999px]:pt-3 max-[999px]:pb-[calc(12px+var(--spacing-safe))] max-[999px]:shadow-[0_-8px_24px_rgba(33,28,23,0.06)]'
export const actionTotal = 'mr-auto hidden flex-col leading-[1.15] max-[999px]:flex'
export const actionTotalLabel = 'text-ink-3 text-xs font-semibold'
export const actionTotalValue = 'font-serif text-2xl font-semibold [font-variant-numeric:lining-nums_tabular-nums]'
export const actionButtons = 'flex gap-3 max-[999px]:ml-auto max-[999px]:[&_.btnPrimary]:min-w-[150px] max-[380px]:gap-2 max-[380px]:[&_.btn]:px-3.5'

// ------------------------------------------------------------- payment
export const recap = 'm-0 rounded-card border-line border bg-white [&>div]:border-line [&>div]:border-b [&>div]:px-4 [&>div]:py-3.5 [&>div:last-child]:border-b-0'
export const recapDt = 'text-ink-3 text-xs font-bold tracking-[0.06em] uppercase'
export const recapDd = 'mt-1 text-[15px]'
export const testBanner = 'rounded-lg border border-dashed border-accent bg-accent-soft px-3.5 py-2.5 text-sm'
export const status = 'flex items-center gap-3 text-[15px] text-ink'
export const statusBlock = 'flex flex-col gap-2.5'
export const progressBar = 'h-2 w-full accent-ink'
export const spinner = 'border-line-strong border-t-ink h-5 w-5 flex-none animate-spin-fast rounded-full border-[2.5px]'
export const callout = 'rounded-card border-line-strong border bg-card p-4 text-[15px] leading-[1.5]'
export const calloutWarn = 'border-[#d9a79b] bg-danger-soft'
export const calloutTitle = 'mb-1 font-bold'

// ------------------------------------------------------------- sandbox
export const sandbox = 'flex flex-col gap-3'
export const sandboxBadge = 'bg-accent-soft self-start rounded-full px-2.5 py-[3px] text-xs font-bold tracking-[0.06em] text-accent uppercase'
export const sandboxTitle = 'font-serif text-[26px] font-medium'
export const sandboxText = 'text-ink-2 text-[14.5px]'
export const sandboxActions = 'mt-1 flex flex-col items-stretch gap-2.5'

// -------------------------------------------------------- confirmation
export const confirmation = 'flex flex-col gap-5'
export const confirmBadge = 'self-start rounded-full bg-[#e4eddc] px-3 py-1 text-xs font-bold tracking-[0.06em] text-ok uppercase'
export const confirmTitle = 'font-serif text-[clamp(30px,5vw,44px)] leading-[1.1] font-medium tracking-[-0.02em]'
export const orderIdCard = 'rounded-xl border-line-strong flex flex-wrap items-baseline gap-x-4 gap-y-2 border bg-card px-5 py-4'
export const orderIdLabel = 'text-ink-3 text-xs font-bold tracking-[0.06em] uppercase'
export const orderId = 'font-serif text-[26px] font-semibold tracking-[0.01em] [font-variant-numeric:lining-nums]'
export const confirmFacts = 'm-0 grid grid-cols-2 gap-4 max-[999px]:grid-cols-1'
export const confirmFactsDt = 'text-ink-3 text-xs font-bold tracking-[0.06em] uppercase'
export const confirmFactsDd = 'mt-1 text-[17px] font-semibold'
export const nextSteps = 'pt-2 [&>p]:text-ink-2 [&>p]:text-[15.5px] [&>p]:leading-[1.55]'
export const confirmActions = 'my-4 flex flex-wrap items-center gap-3'
