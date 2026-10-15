import { useContent } from '../store/content.jsx'
import { appListings } from '../lib/apps.js'

// "Download on the App Store" / "Get it on Google Play" — Apple's and Google's
// own badge artwork (public/badges/), unmodified and at the same 40px height,
// which both sets of guidelines ask for. Each links to its store listing; a
// listing cleared in Site Settings → Mobile app hides its badge, and with
// neither set this renders nothing.
export default function AppBadges({ className = '' }) {
  const listings = appListings(useContent())
  if (!listings.length) return null
  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {listings.map((l) => (
        <a
          key={l.key}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          className="rounded-[7px] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-as-red"
        >
          <img src={l.badge} alt={l.label} width={135} height={40} className="block h-10 w-auto" />
        </a>
      ))}
    </div>
  )
}
