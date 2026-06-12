import { useState } from 'react'

export default function Hero() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (!email) return
    setSent(true)
    setEmail('')
    setTimeout(() => setSent(false), 4000)
  }

  return (
    <section
      id="top"
      className="relative flex items-center overflow-hidden pt-28 pb-16 lg:min-h-screen"
    >
      {/* decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-as-red/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-[28rem] w-[28rem] rounded-full bg-as-gray/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-14">
        {/* left: copy */}
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-as-red/20 bg-as-red/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-as-red">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-as-red opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-as-red" />
            </span>
            New website coming soon
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-as-charcoal sm:text-6xl">
            Absolute Solutions for a{' '}
            <span className="text-as-red">connected</span> world.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-as-charcoal/70 lg:mx-0 sm:text-lg">
            Lebanon&rsquo;s market leader in telecommunication and electronics
            since 2008. We&rsquo;re building something new — get notified the
            moment we launch.
          </p>

          {/* notify form */}
          <form
            onSubmit={submit}
            className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:flex-row lg:mx-0"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-as-charcoal shadow-sm outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-as-red-dark hover:shadow-md active:scale-[0.98]"
            >
              Notify me
            </button>
          </form>
          {sent && (
            <p className="mt-3 text-sm font-medium text-as-red animate-fade-up">
              Thanks! We&rsquo;ll let you know when we go live. 🎉
            </p>
          )}
        </div>

        {/* right: logo showcase — hidden on mobile, visible on desktop */}
        <div className="relative mx-auto hidden w-full max-w-lg items-center justify-center lg:flex">
          <img
            src="/ASCompanyLogo.jpg"
            alt="AS Company"
            className="relative w-full max-w-md animate-float mix-blend-multiply"
          />
        </div>
      </div>
    </section>
  )
}
