-- ===========================================================================
-- AS Store — database schema (PostgreSQL)
-- Run in pgAdmin's Query Tool against the `as_store` database.
-- Idempotent: safe to run more than once.
-- ===========================================================================

-- Auto-touch updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --- Categories ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  tagline     TEXT DEFAULT '',
  image_url   TEXT DEFAULT '',
  sort        INTEGER DEFAULT 0,
  visible     BOOLEAN DEFAULT true,        -- shown publicly at all
  show_in_nav BOOLEAN DEFAULT false,       -- featured in the top navigation menu
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Backfill the nav flag on databases created before it existed.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_nav BOOLEAN DEFAULT false;

-- --- Products --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  tagline     TEXT DEFAULT '',
  description TEXT DEFAULT '',
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  old_price   NUMERIC(10,2),                        -- null = not on sale
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  colors      JSONB DEFAULT '[]'::jsonb,            -- ["#1d1d1f", ...]
  stock       INTEGER DEFAULT 0,
  is_new      BOOLEAN DEFAULT false,
  featured    BOOLEAN DEFAULT false,
  visible     BOOLEAN DEFAULT true,
  sort        INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- --- Product images (gallery; one row per image) ---------------------------
CREATE TABLE IF NOT EXISTS product_images (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt         TEXT DEFAULT '',
  sort        INTEGER DEFAULT 0,
  UNIQUE (product_id, url)
);

-- --- Indexes ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_visible    ON products(visible);
CREATE INDEX IF NOT EXISTS idx_products_featured   ON products(featured);
CREATE INDEX IF NOT EXISTS idx_product_images_prod ON product_images(product_id);

-- --- updated_at triggers ---------------------------------------------------
DROP TRIGGER IF EXISTS trg_categories_updated ON categories;
CREATE TRIGGER trg_categories_updated
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Site settings (singleton, id = 1) -------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id                   INTEGER PRIMARY KEY DEFAULT 1,
  store_name           TEXT DEFAULT 'AS Store',
  announcement_enabled BOOLEAN DEFAULT true,
  announcement_text    TEXT DEFAULT '',
  contact_email        TEXT DEFAULT '',
  contact_phone        TEXT DEFAULT '',
  contact_whatsapp     TEXT DEFAULT '',
  contact_address      TEXT DEFAULT '',
  socials              JSONB DEFAULT '{}'::jsonb,   -- {instagram,facebook,tiktok,x,youtube}
  nav_links            JSONB DEFAULT '[]'::jsonb,   -- [{label, href}]
  footer_groups        JSONB DEFAULT '[]'::jsonb,   -- [{title, links:[{label,href}]}]
  showcase_bg          TEXT DEFAULT '#000000',      -- homepage pinned-showcase section background
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

-- Backfill the showcase background colour on databases created before it existed.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS showcase_bg TEXT DEFAULT '#000000';

-- --- Content pages ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  visible    BOOLEAN DEFAULT true,
  sort       INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pages_updated ON pages;
CREATE TRIGGER trg_pages_updated
  BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Brands ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  image_url  TEXT DEFAULT '',
  visible    BOOLEAN DEFAULT true,
  sort       INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Link products to a brand, and remember where a scraped product came from
-- (so re-scraping updates rather than duplicates).
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id   INTEGER REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_products_brand  ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source_url);

DROP TRIGGER IF EXISTS trg_brands_updated ON brands;
CREATE TRIGGER trg_brands_updated
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Homepage sections (CMS-driven homepage blocks) ------------------------
-- Each row is one block on the storefront homepage. `type` selects which
-- component renders it; `settings` carries type-specific data (buttons,
-- product-rail category/limit, bento tiles). Order is `sort`; `visible` shows
-- or hides it. This is what makes the whole homepage editable.
CREATE TABLE IF NOT EXISTS homepage_sections (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,                 -- hero | showcase | productRail | bento | cta | richtext
  eyebrow     TEXT DEFAULT '',
  heading     TEXT DEFAULT '',
  subheading  TEXT DEFAULT '',
  body        TEXT DEFAULT '',
  image_url   TEXT DEFAULT '',
  bg          TEXT DEFAULT '',               -- background colour ('' = component default)
  text_theme  TEXT DEFAULT 'auto',           -- auto | light | dark (text contrast)
  settings    JSONB DEFAULT '{}'::jsonb,     -- {buttons:[{label,href}], category, limit, tiles:[...], anchor}
  visible     BOOLEAN DEFAULT true,
  sort        INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_sort ON homepage_sections(sort);

DROP TRIGGER IF EXISTS trg_homepage_sections_updated ON homepage_sections;
CREATE TRIGGER trg_homepage_sections_updated
  BEFORE UPDATE ON homepage_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Customers (storefront accounts; separate from the single admin) --------
CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  name          TEXT DEFAULT '',
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,             -- scrypt$salt$hash
  phone         TEXT DEFAULT '',
  address       TEXT DEFAULT '',           -- default delivery address
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Orders ----------------------------------------------------------------
-- Cash-on-delivery orders. Delivery details + line items are snapshotted so the
-- order is stable even if the customer's profile or a product later changes.
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  customer_id    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|confirmed|shipped|delivered|cancelled
  full_name      TEXT DEFAULT '',
  phone          TEXT DEFAULT '',
  address        TEXT DEFAULT '',
  city           TEXT DEFAULT '',
  notes          TEXT DEFAULT '',
  subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cod',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT DEFAULT '',          -- snapshot at purchase time
  price      NUMERIC(10,2) DEFAULT 0,  -- snapshot unit price
  qty        INTEGER DEFAULT 1,
  image      TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
