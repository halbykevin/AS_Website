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
  whatsapp_number TEXT DEFAULT '',
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
  date DATE,
  time TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  city TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  ticket_url TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  excerpt TEXT DEFAULT '',
  description TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banners (
  id SERIAL PRIMARY KEY,
  title TEXT DEFAULT '',
  subtitle TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  focal_x INTEGER DEFAULT 50,
  focal_y INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  eyebrow TEXT DEFAULT '',
  heading TEXT DEFAULT '',
  body TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  button_label TEXT DEFAULT '',
  button_url TEXT DEFAULT '',
  theme TEXT DEFAULT 'light',
  sort INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  image_url TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS popup (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT false,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  link_label TEXT DEFAULT '',
  trigger_type TEXT DEFAULT 'load',
  delay_seconds INTEGER DEFAULT 3,
  scroll_percent INTEGER DEFAULT 40,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT popup_singleton CHECK (id = 1)
);

-- AS Store showcase: a singleton row of section copy + the product strip.
CREATE TABLE IF NOT EXISTS store_showcase (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  eyebrow TEXT DEFAULT '',
  heading TEXT DEFAULT '',
  subheading TEXT DEFAULT '',
  visible_count INTEGER DEFAULT 8,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT store_showcase_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS store_products (
  id SERIAL PRIMARY KEY,
  name TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Horizontal scroll-story: a singleton row of section copy + ordered panels
-- (each a heading + image) shown in the pinned horizontal-scroll homepage hero.
CREATE TABLE IF NOT EXISTS story (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  eyebrow TEXT DEFAULT '',
  heading TEXT DEFAULT '',
  subheading TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT story_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS story_panels (
  id SERIAL PRIMARY KEY,
  heading TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  accent TEXT DEFAULT '',
  accent2 TEXT DEFAULT '',
  gradient_type TEXT DEFAULT 'linear',
  link_url TEXT DEFAULT '',
  size TEXT DEFAULT 'md',
  sort INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Upgrades for existing databases (idempotent).
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_url TEXT DEFAULT '';
ALTER TABLE events DROP COLUMN IF EXISTS price;
ALTER TABLE events DROP COLUMN IF EXISTS category;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hero_primary_label TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hero_secondary_label TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS services_heading TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS services_subheading TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS events_heading TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS events_intro TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_heading TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_subheading TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS size TEXT DEFAULT 'md';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS accent2 TEXT DEFAULT '';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS gradient_type TEXT DEFAULT 'linear';
-- Events belong to an (optional) category; banners can be driven by an event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;
-- Per-banner focal point (%) so the admin controls how the image is cropped.
ALTER TABLE banners ADD COLUMN IF NOT EXISTS focal_x INTEGER DEFAULT 50;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS focal_y INTEGER DEFAULT 50;
-- Multi-date events + provenance for the Ticketing Box Office sync (idempotent upsert).
ALTER TABLE events ADD COLUMN IF NOT EXISTS dates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS events_source_ext ON events(source, external_id) WHERE source <> '';

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

-- Ensure the singleton popup row exists (disabled by default).
INSERT INTO popup (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Ensure the singleton store-showcase row exists with sensible defaults.
INSERT INTO store_showcase (id, enabled, eyebrow, heading, subheading, visible_count)
VALUES (1, true, 'AS Store', 'A glimpse of the AS Store',
  'The latest tech, gadgets and accessories — launching soon.', 8)
ON CONFLICT (id) DO NOTHING;

-- Ensure the singleton story row exists (no panels yet, so it stays hidden).
INSERT INTO story (id, enabled, eyebrow, heading, subheading)
VALUES (1, true, 'AS Company', 'Built for the moment',
  'Keep scrolling to explore what we bring to life.')
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
