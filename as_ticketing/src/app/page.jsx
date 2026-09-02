import { redirect } from 'next/navigation'

// The platform is its events. Sending / straight to the listing keeps one
// canonical URL for "what's on" rather than a homepage that duplicates it —
// which matters because as.com.lb/events is going to 301 here.
export default function Home() {
  redirect('/events')
}
