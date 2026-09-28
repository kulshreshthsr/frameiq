import landing from './landing.module.css'
import styles from './WhySection.module.css'

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
    <section className={`${landing.sectionTight} ${landing.band}`} aria-labelledby="why-heading">
      <div className={landing.inner}>
        <div className={landing.sectionHead}>
          <p className={landing.sectionEyebrow}>Why design first</p>
          <h2 id="why-heading" className={landing.sectionTitle}>
            You should never have to imagine how it'll look
          </h2>
        </div>
        <ul className={styles.grid}>
          {POINTS.map((point) => (
            <li key={point.title} className={styles.item}>
              <h3 className={styles.title}>{point.title}</h3>
              <p className={styles.body}>{point.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
