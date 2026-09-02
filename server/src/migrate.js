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
  logo_size INTEGER DEFAULT 48,
  logo_size_desktop INTEGER DEFAULT 72,
  banner_height NUMERIC(4,1) DEFAULT 6,
  favicon_url TEXT DEFAULT '',
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
  button_enabled BOOLEAN DEFAULT false,
  button_label TEXT DEFAULT 'Explore',
  size TEXT DEFAULT 'md',
  fit TEXT DEFAULT 'cover',
  font_size TEXT DEFAULT 'md',
  sort INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- "What We Do" (Absolute Solution): a singleton row of page copy
-- (about/vision/mission/divisions) + the "solutions" the page lists.
CREATE TABLE IF NOT EXISTS what_we_do (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  eyebrow TEXT DEFAULT '',
  title TEXT DEFAULT '',
  intro JSONB DEFAULT '[]'::jsonb,
  solutions_heading TEXT DEFAULT '',
  solutions_intro TEXT DEFAULT '',
  vision_heading TEXT DEFAULT '',
  vision TEXT DEFAULT '',
  mission_heading TEXT DEFAULT '',
  mission TEXT DEFAULT '',
  divisions_heading TEXT DEFAULT '',
  divisions_intro TEXT DEFAULT '',
  divisions JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT what_we_do_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS solutions (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  icon TEXT DEFAULT 'chip',
  image_url TEXT DEFAULT '',
  intro TEXT DEFAULT '',
  outro TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  sort INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- "Guess the score" game: a singleton row of copy + prize, the admin-created
-- matches (each with two teams + logos), and the public entries (each carrying
-- the exact score the player predicted).
CREATE TABLE IF NOT EXISTS predictor (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT false,
  notify_whatsapp BOOLEAN DEFAULT false,
  title TEXT DEFAULT 'Predict & Win',
  subtitle TEXT DEFAULT '',
  intro TEXT DEFAULT '',
  prize_enabled BOOLEAN DEFAULT true,
  prize_title TEXT DEFAULT '',
  prize_description TEXT DEFAULT '',
  prize_image_url TEXT DEFAULT '',
  deadline TIMESTAMPTZ,
  closed BOOLEAN DEFAULT false,
  success_message TEXT DEFAULT '',
  entry_fee NUMERIC(10,2) DEFAULT 5,
  payment_enabled BOOLEAN DEFAULT true,
  payment_recipient TEXT DEFAULT 'AS Company',
  payment_note TEXT DEFAULT '#as.com.lb',
  payment_instructions TEXT DEFAULT '',
  how_to_win JSONB DEFAULT '[]'::jsonb,
  repost_url TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT predictor_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS predictor_matches (
  id SERIAL PRIMARY KEY,
  stage TEXT DEFAULT '',
  team_a TEXT DEFAULT '',
  team_a_code TEXT DEFAULT '',
  team_a_flag TEXT DEFAULT '',
  team_b TEXT DEFAULT '',
  team_b_code TEXT DEFAULT '',
  team_b_flag TEXT DEFAULT '',
  kickoff TIMESTAMPTZ,
  sort INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  picks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Entries can be archived (kept for the record) instead of deleted; archiving an
-- entry frees its mobile number so the same player can enter the next round.
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
-- One ACTIVE entry per mobile number (stored normalised, see app.js). Before adding
-- the unique index, drop any pre-existing duplicate active entries, keeping the
-- earliest (first prediction wins), so the index can be created on existing databases.
DELETE FROM predictions a USING predictions b
  WHERE a.mobile = b.mobile AND a.id > b.id
    AND NOT a.archived AND NOT b.archived;
DROP INDEX IF EXISTS predictions_mobile_unique;
CREATE UNIQUE INDEX IF NOT EXISTS predictions_mobile_active_unique
  ON predictions(mobile) WHERE NOT archived;
-- Every entry gets a unique, sequential draw number (its "ticket"): shown to the
-- player on submit and included in the admin WhatsApp recap. Assigned from a
-- sequence so numbers never repeat, even across rounds. Backfill existing rows.
CREATE SEQUENCE IF NOT EXISTS predictions_draw_number_seq;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS draw_number INTEGER;
ALTER TABLE predictions ALTER COLUMN draw_number SET DEFAULT nextval('predictions_draw_number_seq');
UPDATE predictions SET draw_number = nextval('predictions_draw_number_seq') WHERE draw_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS predictions_draw_number_unique ON predictions(draw_number);
-- Show/hide the prize block independently of the game (idempotent).
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS prize_enabled BOOLEAN DEFAULT true;
-- Admin toggle for the WhatsApp confirmation (off until a real number is live).
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN DEFAULT false;
-- Whish entry-payment gate: pay a small fee to AS Company with a note to enter.
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS entry_fee NUMERIC(10,2) DEFAULT 5;
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS payment_enabled BOOLEAN DEFAULT true;
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS payment_recipient TEXT DEFAULT 'AS Company';
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS payment_note TEXT DEFAULT '#as.com.lb';
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS payment_instructions TEXT DEFAULT '';
-- Editable "How to win" steps (array of strings). Empty = use the built-in default.
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS how_to_win JSONB DEFAULT '[]'::jsonb;
-- Link to the post players must repost to enter (replaces the old "follow us" gate).
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS repost_url TEXT DEFAULT '';
-- Auto-popup: open the game by itself (like an ad popup), on page load after a
-- delay or once the visitor scrolls a set amount. delay_seconds is NUMERIC so a
-- fractional delay like 0.5s is allowed.
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS auto_open BOOLEAN DEFAULT false;
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'load';
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS delay_seconds NUMERIC(5,2) DEFAULT 1;
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS scroll_percent INTEGER DEFAULT 40;
-- Basketball "Guess the score" round: players share an AS Store item to their
-- story/status to enter, so the game carries the store link, the headline for
-- the prize amount, and the terms shown at the bottom of the card.
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS share_url TEXT DEFAULT 'https://store.as.com.lb';
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS share_message TEXT DEFAULT '';
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS prize_amount TEXT DEFAULT '';
ALTER TABLE predictor ADD COLUMN IF NOT EXISTS terms JSONB DEFAULT '[]'::jsonb;
-- Which platform the player shared on, and the store item they shared.
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS share_platform TEXT DEFAULT '';
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS share_item TEXT DEFAULT '';

-- Lucky-draw wheel: the pool of names the admin spins at /admin/wheel. Entries
-- are typed in by hand (source 'manual') or imported from the ACTIVE "Guess the
-- Score" entries (source 'predictor'). prediction_id links an imported row back
-- to its entry, so re-importing refreshes it instead of duplicating it; the
-- entry survives (unlinked) if that prediction is later deleted.
CREATE TABLE IF NOT EXISTS wheel_entries (
  id SERIAL PRIMARY KEY,
  draw_number TEXT DEFAULT '',
  full_name TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  prediction_id INTEGER REFERENCES predictions(id) ON DELETE SET NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  won_at TIMESTAMPTZ,
  sort INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wheel_entries_prediction_unique
  ON wheel_entries(prediction_id) WHERE prediction_id IS NOT NULL;

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
ALTER TABLE settings ADD COLUMN IF NOT EXISTS favicon_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_size INTEGER DEFAULT 48;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_size_desktop INTEGER DEFAULT 72;
-- Homepage banner height: the shared aspect-ratio denominator (16 : N) for the
-- three homepage strips. Higher = taller. NUMERIC so half-steps like 6.5 work.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS banner_height NUMERIC(4,1) DEFAULT 6;
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS size TEXT DEFAULT 'md';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS font_size TEXT DEFAULT 'md';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS accent2 TEXT DEFAULT '';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS gradient_type TEXT DEFAULT 'linear';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS button_enabled BOOLEAN DEFAULT false;
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS button_label TEXT DEFAULT 'Explore';
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS fit TEXT DEFAULT 'cover';
-- Per-slide focal point (%) so the admin controls how the image is cropped.
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS focal_x INTEGER DEFAULT 50;
ALTER TABLE story_panels ADD COLUMN IF NOT EXISTS focal_y INTEGER DEFAULT 50;
-- Events belong to an (optional) category; banners can be driven by an event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;
-- Per-banner focal point (%) so the admin controls how the image is cropped.
ALTER TABLE banners ADD COLUMN IF NOT EXISTS focal_x INTEGER DEFAULT 50;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS focal_y INTEGER DEFAULT 50;
-- Multi-date events + provenance for the events sync (idempotent upsert):
-- `source` names the ticketing site a row came from, '' = created by hand.
ALTER TABLE events ADD COLUMN IF NOT EXISTS dates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS events_source_ext ON events(source, external_id) WHERE source <> '';

-- Contact form submissions from the public /contact page. Emailed to the staff
-- inbox on arrival (see mailer.js) and kept here so nothing is lost if mail fails.
CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_messages_created ON contact_messages(created_at DESC);

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
  'https://store.as.com.lb', false)
ON CONFLICT (id) DO NOTHING;

-- Ensure the singleton popup row exists (disabled by default).
INSERT INTO popup (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Ensure the singleton predictor row exists (disabled by default).
INSERT INTO predictor (id, enabled, title, subtitle, intro, success_message)
VALUES (1, false, 'Guess the Score',
  'Enter the exact final score.',
  'Share any item you like from the AS Store to your story or status, guess the exact final score, and you could be our lucky winner.',
  'You''re in the draw! Good luck — we''ll be in touch on WhatsApp if you win.')
ON CONFLICT (id) DO NOTHING;

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

-- Ensure the singleton "What We Do" row exists with the Absolute Solution copy.
INSERT INTO what_we_do (id, enabled, eyebrow, title, intro,
  solutions_heading, solutions_intro,
  vision_heading, vision, mission_heading, mission,
  divisions_heading, divisions_intro, divisions)
VALUES (1, true, 'Absolute Solution', 'Absolute Solution',
  '["Absolute Solution is the technology and business solutions division under AS SAL.","With years of expertise in Information Technology, Security Systems, Automation, and Business Solutions, Absolute Solution is dedicated to providing comprehensive services to the Lebanese market. Our professional team of consultants, engineers, and specialists assists organizations in optimizing their operations, securing their assets, and enhancing workplace productivity.","At Absolute Solution, we deliver cutting-edge technologies and innovative business solutions that contribute to efficient, secure, and productive business operations."]'::jsonb,
  'Our Solutions',
  'At Absolute Solution, we believe in a dynamic approach that aligns with your business objectives. Your success is a crucial factor in our growth strategy; therefore, we work in synergy with your organization to deliver measurable results and sustainable growth.',
  'Our Vision',
  'We are focused on delivering world-class Technology, Security, Automation, and Business Solutions. Our vision is to modernize and redefine the industry while continuously improving the customer experience to exceed expectations.',
  'Our Mission',
  'Our mission is to deliver comprehensive and affordable solutions that enable SMEs and enterprises to operate efficiently, securely, and productively. We provide businesses with the tools, technologies, and support needed to focus on growth opportunities and long-term success.',
  'Our Divisions',
  'AS SAL now operates through:',
  '[{"name":"Absolute Solution","description":"Technology, Security, Automation, and Business Solutions."},{"name":"AS Store","description":"Telecommunications, Electronics, and Copy Center Services. Ongoing since 2008, AS Store has become a leader in telecommunications and electronics — a one-stop destination for a wide range of electronic products and advanced copy center services designed to simplify everyday needs."}]'::jsonb)
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
