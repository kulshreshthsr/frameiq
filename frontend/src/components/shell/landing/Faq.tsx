import { inner, section, sectionEyebrow, sectionHeadCenter, sectionTitle } from './sectionStyles'

/** Plain <details>/<summary> — accessible and keyboard-operable with no
 * script of its own, matching "everything you tap" from the rest of the app.
 * Only questions the product can actually answer; no policy invented here
 * that isn't implemented (returns/timelines aren't modelled anywhere yet,
 * so they aren't promised here either). */
const QA = [
  { q: 'Do I need to create an account?', a: 'No. You design and order as a guest. We only ask for your name, phone number and delivery address when you check out.' },
  { q: 'What happens to my wall photo and my pictures?', a: 'They stay on your device while you design. Only when you confirm an order are the photos you actually used uploaded, to make your exact frames.' },
  { q: 'How accurate is the size I see on screen?', a: 'The preview is scaled to the wall width you tell us, so it’s a close approximation — the frames themselves are always made to the exact sizes you chose, listed plainly before you pay.' },
  { q: 'When am I charged?', a: 'Never while you’re designing. You review the full design and total first, then pay securely at checkout — never before.' },
  { q: 'What do I get after I order?', a: 'An order confirmation with your order number and everything you ordered. We use it to produce your frames to the exact design you approved.' },
]

export function Faq() {
  return (
    <section id="faq" className={section} aria-labelledby="faq-heading">
      <div className={inner}>
        <div className={sectionHeadCenter}>
          <p className={sectionEyebrow()}>Questions</p>
          <h2 id="faq-heading" className={sectionTitle()}>
            Good to know
          </h2>
        </div>
        <div className="border-line mx-auto max-w-[720px] border-t">
          {QA.map(({ q, a }) => (
            <details key={q} className="group border-line border-b">
              <summary className="flex list-none items-center justify-between gap-4 px-1 py-[18px] font-serif text-[17px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <span className="flex flex-none text-ink-3 transition-transform duration-200 ease-in-out group-open:rotate-180">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <p className="max-w-[60ch] px-1 pt-0 pb-5 text-[14.5px] leading-[1.6] text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
