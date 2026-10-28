import { AS_TICKETING } from '@/lib/sources'

/**
 * The mark beside a source's name — red for AS Ticketing's own events, neutral
 * for the sites we list from. `onDark` is for a dark chip or the event hero.
 */
export default function SourceDot({ source, onDark = false }) {
  const own = source?.key === AS_TICKETING.key
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
        own ? (onDark ? 'bg-as-red-light' : 'bg-as-red') : onDark ? 'bg-white/60' : 'bg-as-charcoal/30'
      }`}
    />
  )
}
