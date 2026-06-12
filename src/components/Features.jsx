const Icon = ({ d }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-7 w-7"
  >
    <path d={d} />
  </svg>
)

const features = [
  {
    title: 'Shipping All Over Lebanon',
    desc: 'Fast & convenient door-to-door delivery, wherever you are.',
    icon: 'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 19a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm13 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  },
  {
    title: 'Quality',
    desc: 'Best quality products at competitive pricing you can trust.',
    icon: 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z',
  },
  {
    title: 'Offers',
    desc: 'Best deals and seasonal offers you won&rsquo;t want to miss.',
    icon: 'M20 12l-8 8-8-8V4h8zM7.5 7.5h.01',
  },
  {
    title: 'Secure Payments',
    desc: 'Check out with ease through safe and secure payment options.',
    icon: 'M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6zM9 12l2 2 4-4',
  },
]

export default function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-as-red">
            Why Choose Us
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
            Built around your satisfaction
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-black/5 bg-white p-7 shadow-sm transition-all hover:-translate-y-1.5 hover:border-as-red/30 hover:shadow-xl"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-as-red/10 text-as-red transition-colors group-hover:bg-as-red group-hover:text-white">
                <Icon d={f.icon} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-as-charcoal">{f.title}</h3>
              <p
                className="mt-2 text-sm leading-relaxed text-as-charcoal/65"
                dangerouslySetInnerHTML={{ __html: f.desc }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
