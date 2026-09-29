import { inner, section, sectionEyebrow, sectionHeadCenter, sectionTitle } from './sectionStyles'

const STEPS = [
  {
    title: 'Upload your wall',
    body: 'A photo from your phone is enough. Mark the wall and tell us roughly how wide it is.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="5" y="6" width="22" height="20" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="13" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 22l7-6 5.5 5 4-3.5 5.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Design on it',
    body: 'Add your photos, choose a layout, and drag frames into place — right on your own wall.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="6" y="7" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="18" y="13" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 22v2M22 25v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'See the real price',
    body: 'Every frame, size and finish updates the total as you go — nothing is hidden until checkout.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden>
        <circle cx="16" cy="16" r="10.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 10.5v11M13 12.8c0-1.2 1.3-2.1 3-2.1s3 .9 3 2.1c0 3-6 1.9-6 4.9 0 1.2 1.3 2.1 3 2.1s3-.9 3-2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Order what you saw',
    body: 'Confirm the design, add your delivery details, and pay securely — no account needed.',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M7 9h18l-1.6 13.2a2 2 0 0 1-2 1.8H10.6a2 2 0 0 1-2-1.8L7 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M11 9V7a5 5 0 0 1 10 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className={section} aria-labelledby="how-heading">
      <div className={inner}>
        <div className={sectionHeadCenter}>
          <p className={sectionEyebrow()}>How it works</p>
          <h2 id="how-heading" className={sectionTitle()}>
            From an empty wall to an order, in four honest steps
          </h2>
        </div>
        <ol className="m-0 grid list-none grid-cols-4 gap-8 p-0 max-[900px]:grid-cols-2 max-[900px]:gap-7 max-[520px]:grid-cols-1 max-[520px]:gap-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-line-strong relative flex flex-col gap-2.5 border-t pt-2">
              <span className="font-serif text-[13px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              <span className="mt-1.5 mb-0.5 flex h-10 w-10 items-center justify-center text-accent [&_svg]:h-[30px] [&_svg]:w-[30px]">{step.icon}</span>
              <h3 className="font-serif text-lg font-medium text-ink">{step.title}</h3>
              <p className="text-[14.5px] leading-[1.55] text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
