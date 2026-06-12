// ---------------------------------------------------------------------------
// Events data
//
// Sample upcoming events. The admin will create/edit/delete these from the
// backend later; for now they are static so the frontend can be designed.
// `id` is used in the URL (/events/:id) and must be unique.
// ---------------------------------------------------------------------------

export const events = [
  {
    id: 'summer-tech-expo-2026',
    title: 'Summer Tech Expo 2026',
    date: '2026-07-18',
    time: '16:00',
    venue: 'Beirut Forum',
    city: 'Beirut',
    image:
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    ticketUrl: '',
    status: 'open', // open | sold-out | coming-soon
    excerpt:
      'A full day of the latest gadgets, live demos and exclusive launches from AS Company.',
    description:
      'Join us for the biggest tech showcase of the summer. Explore the newest electronics, meet the brands, and be the first to experience exclusive product launches. Reserve your spot to skip the line.',
  },
  {
    id: 'live-music-night',
    title: 'Live Music Night',
    date: '2026-08-02',
    time: '20:30',
    venue: 'Zaitunay Bay',
    city: 'Beirut',
    image:
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
    ticketUrl: '',
    status: 'open',
    excerpt:
      'An unforgettable evening of live performances under the stars by the waterfront.',
    description:
      'AS Company presents a night of live music featuring local and regional artists. Limited seating — reserve early to secure your place.',
  },
  {
    id: 'gaming-championship',
    title: 'Gaming Championship Finals',
    date: '2026-09-14',
    time: '14:00',
    venue: 'BIEL',
    city: 'Beirut',
    image:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    ticketUrl: '',
    status: 'coming-soon',
    excerpt:
      'The region’s top players go head-to-head for the championship title.',
    description:
      'Witness the grand finals of the regional gaming championship, powered by AS Company. Reservations open soon.',
  },
]

export function getEventById(id) {
  return events.find((event) => event.id === id)
}
