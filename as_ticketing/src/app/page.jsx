import { permanentRedirect } from 'next/navigation'

// The platform is its events. Sending / straight to the listing keeps one
// canonical URL for "what's on" rather than a homepage that duplicates it —
// which matters because as.com.lb/events is going to 301 here.
//
// permanentRedirect, not redirect: a 308 tells Google to pass the root domain's
// authority to /events and to index that URL instead. The default 307 says the
// opposite — "keep asking for /, this is temporary" — and would leave the two
// URLs competing indefinitely.
export default function Home() {
  permanentRedirect('/events')
}
