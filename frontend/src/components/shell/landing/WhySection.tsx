import { band, inner, sectionEyebrow, sectionHead, sectionTight, sectionTitle } from './sectionStyles'

/** Only claims the product actually keeps — no reviews or numbers invented
 * to fill the section, since there aren't any to draw from honestly. */
const POINTS = [
  { title: 'See it before it exists', body: 'Your exact photos, on your exact wall, at real size — you approve the design before anything is made.' },
  { title: 'Priced as you design', body: 'Every choice updates the total immediately. The price you see at checkout is the price you saw while designing.' },
  { title: 'No account required', body: 'Design and order as a guest. Your details are only used to make and deliver your order.' },
  { title: 'Made to your sizes', body: 'Frames are produced to the exact dimensions you chose, not the nearest standard size.' },
]

export function WhySection() {
  return (
    <section className={`${sectionTight} ${band}`} aria-labelledby="why-heading">
      <div className={inner}>
        <div className={sectionHead}>
          <p className={sectionEyebrow()}>Why design first</p>
          <h2 id="why-heading" className={sectionTitle()}>
            You should never have to imagine how it'll look
          </h2>
        </div>
        <ul className="m-0 grid list-none grid-cols-4 gap-7 p-0 max-[900px]:grid-cols-2 max-[900px]:gap-6 max-[520px]:grid-cols-1">
          {POINTS.map((point) => (
            <li key={point.title} className="flex flex-col gap-2">
              <h3 className="font-serif text-[17px] font-medium text-ink">{point.title}</h3>
              <p className="text-sm leading-[1.55] text-ink-2">{point.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
