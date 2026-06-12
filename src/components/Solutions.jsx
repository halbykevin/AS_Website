const Icon = ({ d }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
  >
    <path d={d} />
  </svg>
)

const products = [
  { title: 'Telephony & Mobiles', icon: 'M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1zm4 17h2' },
  { title: 'Computers', icon: 'M3 5h18v11H3zM2 20h20M9 16l-1 4m7-4l1 4' },
  { title: 'Laptops & Tablets', icon: 'M4 5h16v10H4zM2 19h20l-2-4H4z' },
  { title: 'Cameras', icon: 'M3 7h4l2-2h6l2 2h4v12H3zM12 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7z' },
  { title: 'Office Stationery', icon: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.586 7.586M11 13a2 2 0 11-4 0 2 2 0 014 0z' },
  { title: 'Gaming, Audio & Video', icon: 'M6 12h4m-2-2v4m7-1h.01M18 11h.01M17 5H7a5 5 0 00-5 5v3a4 4 0 004 4 3 3 0 002.4-1.2L11 18h2l1.6-2.2A3 3 0 0017 17a4 4 0 004-4v-3a5 5 0 00-5-5z' },
]

const serviceItems = [
  'Damaged computers & laptops',
  'Broken screens',
  'Charging glitches',
  'VGA problems',
  'Antivirus',
  'Battery / liquid damage',
  'Audio difficulties',
  'Blue screens',
]

export default function Solutions() {
  return (
    <section id="solutions" className="relative bg-as-charcoal py-20 text-white sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-as-red-light">
            Our Solutions
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            State-of-the-art products & expert service
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/70 sm:text-lg">
            We strive to offer tailored business solutions across a wide range of
            areas, backed by a qualified team of experts in store and a dedicated
            after-sales department to guarantee your satisfaction.
          </p>
        </div>

        {/* product grid */}
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.title}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-as-red/50 hover:bg-white/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-as-red text-white">
                <Icon d={p.icon} />
              </div>
              <span className="text-base font-semibold">{p.title}</span>
            </div>
          ))}
        </div>

        {/* service center */}
        <div className="mt-16 grid gap-10 rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10 lg:grid-cols-2">
          <div>
            <h3 className="text-2xl font-bold">Service Center</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Managed by a team of trained experts ready to accommodate your
              requests. We offer support and maintenance for:
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {serviceItems.map((s) => (
                <li key={s} className="flex items-center gap-2.5 text-sm text-white/85">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-as-red/20 text-as-red-light">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-as-red to-as-red-dark p-8">
            <h3 className="text-2xl font-bold">Miscellaneous Services</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/90">
              To ease your life, we&rsquo;ve brought you the Virgin Ticketing Box
              Office — your gateway to events, concerts, and entertainment, all
              under one roof.
            </p>
            <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-4 py-2.5 shadow-sm">
              <img
                src="/ticketing-box-office.png"
                alt="Ticketing Box Office"
                className="h-8 w-auto"
              />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
