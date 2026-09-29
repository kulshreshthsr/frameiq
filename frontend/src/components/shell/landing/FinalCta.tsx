export function FinalCta() {
  return (
    <section className="bg-ink px-6 py-20 text-paper max-[720px]:px-5 max-[720px]:py-14" aria-labelledby="final-cta-heading">
      <div className="mx-auto flex max-w-[640px] flex-col items-center gap-6 text-center">
        <h2 id="final-cta-heading" className="font-serif text-[clamp(28px,3.4vw,40px)] font-medium tracking-[-0.015em]">
          Your wall is waiting.
        </h2>
        {/* Inverted from the usual .btnPrimary (dark on paper) because this
            whole band is already dark — utilities always win over the
            .btnPrimary component class regardless of order, since Tailwind
            layers utilities after components. */}
        <a href="#start" className="btn btnPrimary bg-paper text-ink hover:bg-card">
          Design your wall
        </a>
      </div>
    </section>
  )
}
