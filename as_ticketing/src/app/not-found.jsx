import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="mx-auto max-w-3xl px-5 py-28 text-center sm:px-8">
      <h1 className="text-3xl font-extrabold text-as-charcoal">Event not found</h1>
      <p className="mt-4 text-as-charcoal/60">
        This event may have ended, sold out, or been taken down by the box office.
      </p>
      <Link
        href="/events"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-as-red-light"
      >
        See what’s on
      </Link>
    </section>
  )
}
