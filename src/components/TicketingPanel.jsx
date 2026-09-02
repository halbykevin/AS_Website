import EventsLink from './EventsLink.jsx'

// The events panel on the homepage: the AS Ticketing Hub logo, and nothing
// else. Tapping it opens the ticketing platform (settings.ticketingUrl, or
// /events while that is empty) — see EventsLink.
//
// This replaced an admin-managed carousel of event artwork. Events moved to
// ticketing.as.com.lb, so the panel's job changed from "show what's on" to
// "point at where what's on now lives", and a rotating gallery of individual
// events would have competed with that rather than served it.
//
// Keeps the geometry of the two panels beside it: the same admin-set 16:N
// aspect ratio, the same corner radius and shadow, and `fill` to stretch to the
// desktop bento cell's height instead of imposing its own ratio.
export default function TicketingPanel({ height, fill = false }) {
  const ratio = Number(height) > 0 ? Number(height) : 6

  return (
    <section aria-label="Events" className={`relative w-full ${fill ? 'h-full' : ''}`}>
      <EventsLink
        className={`group relative flex w-full items-center justify-center overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-black/10 ring-1 ring-black/[0.04] transition-shadow duration-500 hover:shadow-black/20 motion-safe:animate-pulse-soft hover:[animation-play-state:paused] sm:rounded-[36px] ${
          fill ? 'h-full' : ''
        }`}
        style={
          fill
            ? { animationDelay: '-1.3s' }
            : { animationDelay: '-1.3s', aspectRatio: `16 / ${ratio}` }
        }
      >
        <img
          src="/as-ticketing-hub-logo.png"
          alt="AS Ticketing Hub"
          // The panel is short and wide, the lockup is tall — so height is what
          // constrains it. Cap both so it never touches the rounded corners.
          className="max-h-[72%] w-auto max-w-[62%] object-contain transition-transform duration-500 group-hover:scale-[1.03]"
          // It is the largest thing above the fold on the homepage.
          fetchPriority="high"
        />
      </EventsLink>
    </section>
  )
}
