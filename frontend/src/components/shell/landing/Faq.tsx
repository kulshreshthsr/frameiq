import landing from './landing.module.css'
import styles from './Faq.module.css'

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
    <section className={landing.section} aria-labelledby="faq-heading">
      <div className={landing.inner}>
        <div className={landing.sectionHeadCenter}>
          <p className={landing.sectionEyebrow}>Questions</p>
          <h2 id="faq-heading" className={landing.sectionTitle}>
            Good to know
          </h2>
        </div>
        <div className={styles.list}>
          {QA.map(({ q, a }) => (
            <details key={q} className={styles.item}>
              <summary className={styles.question}>
                {q}
                <span className={styles.chevron} aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <p className={styles.answer}>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
