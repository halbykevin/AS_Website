import 'dotenv/config'
import { pool } from './db.js'

// Inserts sample services + events, but ONLY if those tables are empty.
// Safe to run multiple times. Run after `npm run migrate`.

const services = [
  ['Telecommunication', 'Cutting-edge telecom products and solutions that keep Lebanon connected.', 'signal', 0],
  ['Electronics & Tech', 'A curated range of the latest electronics, gadgets and accessories.', 'chip', 1],
  ['Live Events & Ticketing', 'We host and power unforgettable events — reserve your spot in just a few taps.', 'ticket', 2],
  ['Retail & Support', 'Trusted retail experience backed by expert advice and after-sales support.', 'support', 3],
]

const events = [
  {
    title: 'Summer Tech Expo 2026', slug: 'summer-tech-expo-2026',
    date: '2026-07-18', time: '16:00', venue: 'Beirut Forum', city: 'Beirut',
    image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    ticket_url: '', status: 'open',
    excerpt: 'A full day of the latest gadgets, live demos and exclusive launches from AS Company.',
    description: 'Join us for the biggest tech showcase of the summer. Explore the newest electronics, meet the brands, and be the first to experience exclusive product launches.',
    sort: 0,
  },
  {
    title: 'Live Music Night', slug: 'live-music-night',
    date: '2026-08-02', time: '20:30', venue: 'Zaitunay Bay', city: 'Beirut',
    image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
    ticket_url: '', status: 'open',
    excerpt: 'An unforgettable evening of live performances under the stars by the waterfront.',
    description: 'AS Company presents a night of live music featuring local and regional artists. Limited seating — reserve early to secure your place.',
    sort: 1,
  },
  {
    title: 'Gaming Championship Finals', slug: 'gaming-championship',
    date: '2026-09-14', time: '14:00', venue: 'BIEL', city: 'Beirut',
    image_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    ticket_url: '', status: 'coming-soon',
    excerpt: 'The region’s top players go head-to-head for the championship title.',
    description: 'Witness the grand finals of the regional gaming championship, powered by AS Company. Reservations open soon.',
    sort: 2,
  },
]

async function run() {
  const svc = await pool.query('SELECT count(*)::int AS n FROM services')
  if (svc.rows[0].n === 0) {
    for (const [title, description, icon, sort] of services) {
      await pool.query(
        'INSERT INTO services (title, description, icon, sort) VALUES ($1,$2,$3,$4)',
        [title, description, icon, sort]
      )
    }
    console.log(`✓ Seeded ${services.length} services`)
  } else {
    console.log('• Services already present — skipped')
  }

  const ev = await pool.query('SELECT count(*)::int AS n FROM events')
  if (ev.rows[0].n === 0) {
    for (const e of events) {
      await pool.query(
        `INSERT INTO events (title, slug, date, time, venue, city, image_url, ticket_url, status, excerpt, description, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [e.title, e.slug, e.date, e.time, e.venue, e.city, e.image_url, e.ticket_url, e.status, e.excerpt, e.description, e.sort]
      )
    }
    console.log(`✓ Seeded ${events.length} events`)
  } else {
    console.log('• Events already present — skipped')
  }

  await pool.end()
}

run().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
