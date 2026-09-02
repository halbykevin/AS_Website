import { Link } from 'react-router-dom'
import { useContent } from '../store/content.jsx'

// Every link into the events experience goes through here.
//
// While `settings.ticketingUrl` is empty these are ordinary in-site routes to
// /events. The moment an admin fills it in (Site Settings -> Events), all of
// them point at the ticketing platform instead — the nav, the footer, the
// banner, the category tiles, the event cards — without a code change.
//
// One component so the ~10 call sites can't drift apart: a half-migrated site,
// where the banner goes to the platform but the nav stays here, is worse than
// either end state.
//
// `to` is the part AFTER /events: '' for the listing, '?category=concerts' for
// a filter, '/some-event-slug' for one event.
//
// Same tab on purpose. The plan is for as.com.lb/events to 301 to the platform,
// and a redirect never opens a new tab — links that did would behave
// differently from typing the URL. (The AS Store button is the opposite case:
// a genuinely separate shopping trip.)
export default function EventsLink({ to = '', children, ...props }) {
  const { ticketingUrl } = useContent()
  return ticketingUrl ? (
    <a href={eventsHref(ticketingUrl, to)} {...props}>
      {children}
    </a>
  ) : (
    <Link to={`/events${to}`} {...props}>
      {children}
    </Link>
  )
}

// The same resolution for the places that need a bare string rather than a
// component (an <a href>, a redirect, a JSON-LD url).
export function eventsHref(ticketingUrl, to = '') {
  return ticketingUrl ? `${String(ticketingUrl).replace(/\/+$/, '')}/events${to}` : `/events${to}`
}
