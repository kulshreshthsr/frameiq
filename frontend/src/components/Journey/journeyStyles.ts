/**
 * Tailwind class strings shared across the configurator's step panel and its
 * six steps (replaces Journey.module.css, 465 lines). Same plain-values
 * rationale as sectionStyles.ts/adminStyles.ts/checkoutStyles.ts.
 */

// ------------------------------------------------------------- shell
// The step panel: a side panel on desktop, a bottom sheet on phones.
export const panel = 'flex min-h-0 flex-col border-l border-line bg-card max-[999px]:border-l-0 max-[999px]:border-t max-[999px]:max-h-[min(52dvh,480px)] max-[999px]:shadow-[0_-8px_24px_rgba(33,28,23,0.08)]'
export const head = 'flex min-h-12 flex-none items-center justify-between px-6 pt-1 max-[999px]:min-h-10 max-[999px]:px-4 max-[999px]:pt-0.5'
export const stepCount = 'text-ink-3 text-xs font-bold tracking-[0.08em] uppercase'
export const body = 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-1 pb-6 max-[999px]:px-4 max-[999px]:pt-0 max-[999px]:pb-4'
export const title = 'font-serif text-3xl leading-[1.15] font-medium tracking-[-0.015em] text-ink focus:outline-none max-[999px]:text-2xl'
export const subtitle = 'mt-2 text-[15px] leading-[1.5] text-ink-2 max-[999px]:mt-1.5 max-[999px]:text-sm'
export const content = 'mt-5.5 max-[999px]:mt-4'
export const foot = 'flex-none border-t border-line bg-card px-6 pt-3.5 pb-[calc(14px+var(--spacing-safe))] max-[999px]:px-4 max-[999px]:pt-2.5 max-[999px]:pb-[calc(10px+var(--spacing-safe))]'
export const footerRow =
  'flex items-center justify-between gap-4 ' +
  '[&_.btn]:flex-none [&_.btn]:min-w-[170px] max-[999px]:[&_.btn]:min-w-[150px] max-[360px]:[&_.btn]:min-w-[128px] max-[360px]:[&_.btn]:px-3.5'

// ------------------------------------------------------------ layout
export const stack = 'flex flex-col gap-6 max-[999px]:gap-5'
export const section = 'flex flex-col items-start gap-3 [&>*]:max-w-full'
export const sectionTitle = 'text-[13px] font-bold tracking-[0.06em] text-ink uppercase'
export const sectionScope = 'font-semibold tracking-[0.02em] text-ink-3 normal-case'
export const hint = 'text-sm leading-[1.5] text-ink-2'
export const fineprint = 'text-[12.5px] leading-[1.5] text-ink-3'
export const statusOk = 'text-ok text-sm leading-[1.5] font-semibold'
export const noteBox = 'rounded-card border-line-strong border bg-paper px-3.5 py-3 text-sm leading-[1.45] text-ink-2'
export const buttonRow = 'flex flex-wrap gap-2'
export const card = 'flex flex-col gap-3 rounded-card border border-line bg-white p-4'
export const cardTitle = 'text-ink-3 text-[13px] font-bold tracking-[0.06em] uppercase'
export const cardName = 'text-left text-sm leading-[1.25] font-semibold text-ink'
export const cardMeta = 'text-ink-3 text-[13px]'

/** One rule for every selectable card/option: the chosen one is outlined in
 * ink with a second ring, so selection never relies on colour alone. */
export function cardState(base: string, active: boolean) {
  return active ? `${base} border-ink bg-white shadow-[0_0_0_1px_var(--color-ink)]` : `${base} border-line hover:border-line-strong`
}

// --------------------------------------------------------- wall step
export const stepper = 'flex items-center gap-2'
export const stepperButton = 'h-12 w-12 rounded-lg border border-line-strong bg-card text-[22px] leading-none hover:bg-paper-2'
export const stepperField =
  'flex h-12 min-w-[140px] items-center gap-2 rounded-lg border border-line-strong bg-white px-3.5 text-sm text-ink-3 ' +
  'focus-within:border-ink focus-within:shadow-[0_0_0_1px_var(--color-ink)] ' +
  '[&_input]:min-w-0 [&_input]:flex-1 [&_input]:w-full [&_input]:border-none [&_input]:outline-none [&_input]:bg-transparent [&_input]:text-lg [&_input]:font-semibold [&_input]:text-ink [&_input]:[font-variant-numeric:tabular-nums] [&_input[aria-invalid="true"]]:text-danger'

// ---------------------------------------------------------- layouts
export const layoutList = 'pb-2 min-[1000px]:grid min-[1000px]:grid-cols-2 min-[1000px]:gap-3 min-[1000px]:overflow-visible min-[1000px]:m-0 min-[1000px]:pt-0.5 min-[1000px]:pb-0'
export const layoutCard = 'flex w-[132px] flex-col items-start gap-1.5 rounded-card border-[1.5px] px-2 pt-2 pb-2.5 text-left transition-colors duration-150 ease-in-out min-[1000px]:w-auto'
export const layoutPreview = 'relative aspect-[4/3] w-full overflow-hidden rounded-[5px] bg-paper-2'
export const layoutSlot = 'absolute rounded-[1px] border-[1.5px] border-ink-2 bg-white'

// ----------------------------------------------------------- frames
export const productList = 'pb-2 min-[1000px]:grid min-[1000px]:grid-cols-2 min-[1000px]:gap-3 min-[1000px]:overflow-visible min-[1000px]:m-0 min-[1000px]:pt-0.5 min-[1000px]:pb-0'
export const productCard = 'flex w-32 flex-col items-start gap-1 rounded-card border-[1.5px] px-2 pt-2 pb-3 text-left transition-colors duration-150 ease-in-out min-[1000px]:w-auto'
export const productSwatch = 'flex w-full items-center justify-center rounded-md bg-paper-2 pt-1 pb-1.5 leading-[0]'

// ------------------------------------------------------------- size
export const sizeGrid = 'grid w-full grid-cols-2 gap-2'
export const sizeButton = 'grid min-h-[60px] grid-cols-[1fr_auto] grid-rows-[auto_auto] items-center gap-x-2 rounded-card border-[1.5px] px-3 py-2.5 text-left transition-colors duration-150 ease-in-out'
export const sizeMain = 'col-start-1 row-start-1 text-[15px] font-bold text-ink'
export const sizeSub = 'text-ink-3 col-start-1 row-start-2 text-xs'
export const sizePrice = 'col-start-2 row-span-2 row-start-1 text-sm font-semibold text-ink [font-variant-numeric:tabular-nums]'
export const inlineField = 'flex w-full flex-col gap-1.5 [&_.segmented]:w-full [&_.segment]:flex-1 [&_.segment]:px-2.5 [&_.segment]:text-[13.5px]'
export const fieldLabel = 'text-[13px] font-semibold text-ink-2'
