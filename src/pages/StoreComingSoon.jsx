import { Link } from 'react-router-dom'
import { useContent } from '../store/content.jsx'

// "AS Store — Coming Soon" page. Reached from the homepage store showcase while
// the real store isn't live yet (store.url empty). Mirrors the site-wide
// ComingSoon, but fronted by the AS Store logo.
export default function StoreComingSoon() {
  const { contact } = useContent()
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white px-5 py-12 text-center sm:px-8">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-as-red/5 blur-3xl sm:h-96 sm:w-96" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-as-charcoal/5 blur-3xl sm:h-96 sm:w-96" />

      <main className="relative z-10 flex w-full max-w-xl flex-col items-center">
        <img
          src="/asStorelogo.png"
          alt="AS Store"
          width="240"
          height="120"
          fetchpriority="high"
          decoding="async"
          className="h-24 w-auto sm:h-32"
        />

        <p className="mt-10 inline-flex items-center gap-2 rounded-full border border-as-red/20 bg-as-red/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-as-red">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-as-red opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-as-red" />
          </span>
          Coming Soon
        </p>

        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-as-charcoal sm:text-4xl">
          The AS Store is on its way
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-as-charcoal/60 sm:text-lg">
          We&rsquo;re building a dedicated online store for the latest tech, gadgets and accessories.
          Stay tuned — and reach out anytime in the meantime.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <a
            href={contact.whatsapp}
            target="_blank"
            rel="noreferrer"
            className="w-full rounded-full bg-as-red px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md sm:w-auto"
          >
            Message us
          </a>
          <Link
            to="/"
            className="w-full rounded-full border border-black/10 bg-white px-8 py-3.5 text-sm font-semibold text-as-charcoal transition hover:border-as-red/30 hover:text-as-red sm:w-auto"
          >
            ← Back to AS Company
          </Link>
        </div>

        <p className="mt-12 text-xs text-as-charcoal/40">
          © {new Date().getFullYear()} AS Company — Absolute Solutions SAL. All rights reserved.
        </p>
      </main>
    </div>
  )
}
