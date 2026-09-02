import Image from 'next/image'
import Link from 'next/link'

// The AS Ticketing Hub identity, in the two shapes the app needs.
//
// The supplied artwork (public/Logo/logo.png) is a square, stacked lockup on a
// white card: the ticket mark above "Ticketing Hub". Two things follow from
// that, and they are why this file exists rather than one <img>:
//
//   - It is a LIGHT-background asset, so the chrome around it is light. A dark
//     header would frame it in a white box.
//   - Stacked, it is unreadable in a 40px header — the wordmark would be about
//     four pixels tall. So the header relays the same lockup horizontally: the
//     ticket mark, with "Ticketing Hub" as live text beside it in the brand
//     face. Same elements, same order, laid out for the space.
//
// Both PNGs are derived from that original by trimming its card padding (the
// artwork occupied barely half the file) and, for the mark, cutting below the
// wordmark. The original is kept alongside them as the source.

/** Horizontal lockup for the header: the mark plus live text. */
export default function Brand({ className = '', height = 34 }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 ${className}`}
      aria-label="AS Ticketing Hub"
    >
      <Image
        src="/as-ticketing-hub-mark.png"
        alt=""
        width={Math.round(height * 2.07)}
        height={height}
        priority
        className="w-auto"
        style={{ height }}
      />
      <span className="text-[15px] font-bold leading-none tracking-tight text-as-charcoal sm:text-base">
        Ticketing<span className="text-as-red"> Hub</span>
      </span>
    </Link>
  )
}

/** The full stacked lockup, as supplied — for the footer and social previews. */
export function BrandLockup({ width = 190, className = '' }) {
  return (
    <Image
      src="/as-ticketing-hub-logo.png"
      alt="AS Ticketing Hub"
      width={width}
      height={Math.round((width * 723) / 874)}
      className={`h-auto ${className}`}
    />
  )
}
