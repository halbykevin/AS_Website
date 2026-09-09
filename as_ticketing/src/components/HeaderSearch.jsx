'use client'

import { useState } from 'react'
import EventSearch from './EventSearch'

/**
 * Search in the site chrome, so it is reachable from an event page and from
 * halfway down a long listing — not only from the top of /events.
 *
 * On a phone the header has room for the logo and one nav link, so search is a
 * button that drops a full-width field underneath it; from sm up it is simply
 * there. Deliberately no `useSearchParams()` here: this renders in the root
 * layout, and reading the query string from a client component in the layout
 * would opt every static page in the app out of static rendering. The field
 * that mirrors ?q= is the one on the listing page itself.
 */
export default function HeaderSearch({ events = [] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="hidden sm:block sm:w-52 lg:w-72">
        <EventSearch events={events} variant="compact" />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close search' : 'Search events'}
        className="grid h-9 w-9 place-items-center rounded-full text-as-charcoal/70 transition hover:bg-as-charcoal/[0.06] hover:text-as-red sm:hidden"
      >
        {open ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        )}
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full border-b border-black/[0.07] bg-white px-5 py-3 shadow-lg shadow-black/5 sm:hidden">
          <EventSearch
            events={events}
            variant="compact"
            autoFocus
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </>
  )
}
