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

// The six Absolute Solution "solutions" shown on /what-we-do (each opens a
// detail page). `items` is a JSONB list of { title, description }.
const solutions = [
  {
    slug: 'network-solutions', title: 'Network Solutions', icon: 'network', sort: 0,
    summary: 'Complete network solutions designed to improve performance, increase security, and simplify operations.',
    intro: 'We provide complete network solutions designed to improve performance, increase security, and simplify operations.',
    outro: '',
    items: [
      { title: 'Network Infrastructure', description: '' },
      { title: 'Network Security', description: '' },
      { title: 'IT Security Solutions', description: '' },
      { title: 'Voice Solutions', description: '' },
      { title: 'Structured Cabling', description: '' },
    ],
  },
  {
    slug: 'system-solutions', title: 'System Solutions', icon: 'server', sort: 1,
    summary: 'State-of-the-art system solutions that enhance business performance and increase profitability.',
    intro: 'We provide state-of-the-art system solutions that enhance business performance and increase profitability.',
    outro: 'These solutions help optimize IT investments, improve application performance, consolidate infrastructure, and ensure operational resilience.',
    items: [
      { title: 'Virtualization', description: '' },
      { title: 'Cloud Solutions', description: '' },
      { title: 'Servers & Storage', description: '' },
      { title: 'System Infrastructure', description: '' },
      { title: 'Data Backup & Disaster Recovery', description: '' },
      { title: 'Business Continuity Solutions', description: '' },
    ],
  },
  {
    slug: 'security-solutions', title: 'Security Solutions', icon: 'shield', sort: 2,
    summary: 'Protecting your people, premises, and assets is a core part of our service offering.',
    intro: 'Protecting your people, premises, and assets is a core part of our service offering.',
    outro: '',
    items: [
      { title: 'Video Surveillance (CCTV)', description: 'Customized surveillance systems designed to improve security and monitoring across all types of facilities.' },
      { title: 'Intrusion Alarm Systems', description: 'From basic alarm installations to fully integrated security platforms capable of managing multiple sites.' },
      { title: 'Access Control Systems', description: 'Advanced access management solutions providing secure, transparent, and reliable monitoring of facility access.' },
      { title: 'Fire Detection Systems', description: 'Conventional and addressable fire alarm systems designed to protect lives, property, and business continuity.' },
      { title: 'Videophone & Intercom Systems', description: 'Audio and video communication systems for residential, commercial, and industrial environments.' },
      { title: 'Public Address Systems', description: 'Integrated communication systems for emergency announcements and public information broadcasting.' },
      { title: 'Safe Boxes', description: 'Advanced fire-resistant and secure storage solutions for documents, valuables, and sensitive information.' },
      { title: 'Money Counters', description: 'High-accuracy currency counting and verification systems using advanced image processing technology.' },
    ],
  },
  {
    slug: 'smart-home-building-automation', title: 'Smart Home & Building Automation', icon: 'home', sort: 3,
    summary: 'Smart Home and Building Automation Systems that bring convenience, security, and energy efficiency together.',
    intro: 'We design and implement Smart Home and Building Automation Systems that bring convenience, security, and energy efficiency together. Our automation solutions allow centralized control of:',
    outro: 'Accessible locally or remotely through internet-connected devices.',
    items: [
      { title: 'Lighting', description: '' },
      { title: 'Climate Control', description: '' },
      { title: 'Security Systems', description: '' },
      { title: 'Audio & Video Systems', description: '' },
      { title: 'Door Access', description: '' },
      { title: 'Remote Monitoring', description: '' },
    ],
  },
  {
    slug: 'business-stationery-workplace', title: 'Business Stationery & Workplace Solutions', icon: 'pen', sort: 4,
    summary: 'Quality office essentials and workplace solutions to support your daily operations.',
    intro: 'A productive workplace requires the right tools and supplies. Through our Business Stationery and Workplace Solutions, we provide organizations with quality office essentials to support daily operations.',
    outro: 'We work with trusted international brands to provide reliable products that improve workplace efficiency and productivity.',
    items: [
      { title: 'Filing Systems', description: '' },
      { title: 'Desk Accessories', description: '' },
      { title: 'Writing Instruments', description: '' },
      { title: 'Papers & Office Supplies', description: '' },
      { title: 'Glues & Adhesive Tapes', description: '' },
      { title: 'Computer Accessories', description: '' },
      { title: 'Ink & Toner Supplies', description: '' },
      { title: 'Visual Presentation Solutions', description: '' },
    ],
  },
  {
    slug: 'support-services', title: 'Support Services', icon: 'support', sort: 5,
    summary: 'Comprehensive support services to ensure the smooth operation of your technology and business infrastructure.',
    intro: 'We offer comprehensive support services to ensure the smooth operation of your technology and business infrastructure.',
    outro: 'Our dedicated team provides prompt, organized, and effective support to keep your business running efficiently.',
    items: [
      { title: 'Maintenance Contracts', description: '' },
      { title: 'Onsite Support', description: '' },
      { title: 'Remote Support', description: '' },
      { title: 'On-Demand Support', description: '' },
      { title: 'IT Consultancy', description: '' },
      { title: 'Security System Maintenance', description: '' },
      { title: 'Infrastructure Management', description: '' },
      { title: 'Technical Assistance', description: '' },
    ],
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

  const sol = await pool.query('SELECT count(*)::int AS n FROM solutions')
  if (sol.rows[0].n === 0) {
    for (const s of solutions) {
      await pool.query(
        `INSERT INTO solutions (slug, title, summary, icon, intro, outro, items, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [s.slug, s.title, s.summary, s.icon, s.intro, s.outro, JSON.stringify(s.items), s.sort]
      )
    }
    console.log(`✓ Seeded ${solutions.length} solutions`)
  } else {
    console.log('• Solutions already present — skipped')
  }

  await pool.end()
}

run().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
