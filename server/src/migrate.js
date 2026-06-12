import 'dotenv/config'
import { pool } from './db.js'

// Creates all tables (idempotent) and ensures the single settings row exists.
const schema = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  brand_name TEXT DEFAULT '',
  legal_name TEXT DEFAULT '',
  tagline TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  hero_eyebrow TEXT DEFAULT '',
  hero_title TEXT DEFAULT '',
  hero_subtitle TEXT DEFAULT '',
  about_heading TEXT DEFAULT '',
  about_body JSONB DEFAULT '[]'::jsonb,
  about_stats JSONB DEFAULT '[]'::jsonb,
  contact_email TEXT DEFAULT '',
  contact_whatsapp TEXT DEFAULT '',
  contact_instagram TEXT DEFAULT '',
  contact_instagram_handle TEXT DEFAULT '',
  store_title TEXT DEFAULT '',
  store_eyebrow TEXT DEFAULT '',
  store_description TEXT DEFAULT '',
  store_url TEXT DEFAULT '',
  published BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT 'chip',
  sort INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT '',
  date DATE,
  time TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  city TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  price TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  excerpt TEXT DEFAULT '',
  description TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure the singleton settings row exists with sensible defaults.
INSERT INTO settings (id, brand_name, legal_name, tagline,
  hero_eyebrow, hero_title, hero_subtitle,
  about_heading, about_body, about_stats,
  contact_email, contact_whatsapp, contact_instagram, contact_instagram_handle,
  store_title, store_eyebrow, store_description, store_url, published)
VALUES (1,
  'AS Company', 'Absolute Solutions SAL',
  'Market leader in telecommunication and electronics in Lebanon since 2008.',
  'Telecommunication & Electronics',
  'Powering connection across Lebanon since 2008.',
  'From the latest technology to unforgettable live events, AS Company brings people together. Discover what we do and reserve your spot at our upcoming events.',
  'About AS Company',
  '["Absolute Solutions SAL (AS Company) has been a market leader in telecommunication and electronics in Lebanon since 2008.","We combine a passion for technology with a commitment to bringing people together — whether through the products we sell or the live events we power."]'::jsonb,
  '[{"value":"2008","label":"Established"},{"value":"15+","label":"Years of experience"},{"value":"Lebanon","label":"Proudly local"}]'::jsonb,
  'info@as.com.lb', 'https://wa.me/message/EHISICDXT6DJC1',
  'https://www.instagram.com/ascompany.lb/', '@ascompany.lb',
  'AS Store', 'Coming soon',
  'Our dedicated online store where you buy the latest tech. Launching soon — stay tuned.',
  '', false)
ON CONFLICT (id) DO NOTHING;
`

async function run() {
  await pool.query(schema)
  console.log('✓ Migration complete — tables ready and settings row ensured.')
  await pool.end()
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
