import { Link } from 'react-router-dom'

// The call-to-action pinned to a homepage banner's top-right — "Shop now" on the
// store story, "Book now" on the events banner. One component so the two, which
// sit right on top of each other, can't drift apart.
//
// Render it as a SIBLING of the banner's drag container, never a child, or a
// swipe ends up firing it.
// `inline` drops the absolute positioning and leaves the pill in normal flow —
// for a banner whose content reaches the top edge (the store slideshow's cards),
// where a floating button would sit on top of a product instead of beside it.
export default function BannerCta({ href, label, newTab = true, inline = false }) {
  const pill =
    'inline-flex items-center gap-1.5 rounded-full bg-as-red px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-black/25 transition hover:bg-as-red-dark sm:px-5 sm:py-2.5 sm:text-sm'
  // Inset far enough to clear the banner's rounded corner.
  const cls = inline ? pill : `absolute right-4 top-4 z-30 ${pill} sm:right-6 sm:top-6`
  const inner = (
    <>
      {label}
      <svg
        className="h-3.5 w-3.5 sm:h-4 sm:w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </>
  )

  // Either button can point off-site (settings.storeUrl / settings.ticketingUrl);
  // in-site routes stay client-side. The store opens a new tab because it is a
  // separate shopping trip; the events CTA does not, because /events is destined
  // to 301 to the same place and a redirect never opens a tab.
  return /^https?:\/\//i.test(href) ? (
    <a href={href} {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})} className={cls}>
      {inner}
    </a>
  ) : (
    <Link to={href} className={cls}>
      {inner}
    </Link>
  )
}
