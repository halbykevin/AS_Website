const divisions = [
  { name: 'Software', desc: 'Systems & applications' },
  { name: 'Solution', desc: 'Tailored business solutions' },
  { name: 'Security', desc: 'Protection & surveillance' },
  { name: 'Strategy', desc: 'Consulting & growth' },
  { name: 'Stationery', desc: 'Office essentials' },
]

export default function WhoWeAre() {
  return (
    <section id="about" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-as-red">
            Who We Are
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
            Market leaders since <span className="text-as-red">2008</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-as-charcoal/70 sm:text-lg">
            AS Company has grown into the market leader in the field of
            telecommunication and electronics. Built on trust and expertise, our
            work spans five specialized divisions that cover every side of the
            business.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-5">
          {divisions.map((d, i) => (
            <div
              key={d.name}
              className="group rounded-2xl border border-black/5 bg-white p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-as-red/30 hover:shadow-lg"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-as-red/10 text-lg font-extrabold text-as-red transition-colors group-hover:bg-as-red group-hover:text-white">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="mt-4 text-base font-bold text-as-charcoal">{d.name}</h3>
              <p className="mt-1 text-xs text-as-charcoal/60">{d.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
