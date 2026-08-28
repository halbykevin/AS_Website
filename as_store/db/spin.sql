-- ===========================================================================
-- Daily Spin — the mobile app's once-per-cooldown prize wheel, and the
-- vouchers it hands out.
--
-- Split from schema.sql for the same reason notifications.sql is: it is a
-- self-contained domain, and `migrate.js` applies the files in order so the
-- foreign keys below can rely on customers/orders already existing.
--
-- Shape of the feature:
--   spin_settings  one row (id = 1) — the CMS-driven copy, cooldown and
--                  default voucher validity.
--   spin_prizes    the wheel slices. Weight = relative odds, stock caps how
--                  many can ever be awarded. The server draws from these; the
--                  app only animates to the slice the server picked.
--   spin_spins     one row per spin — the audit log AND the cooldown clock
--                  (the next spin is allowed cooldown_hours after the last).
--   spin_resets    staff handing one customer their spin back: the clock only
--                  counts spins taken after the customer's latest reset.
--   vouchers       what a win is worth. Account-bound and single-use, redeemed
--                  at checkout (percent / amount / free delivery) or fulfilled
--                  by staff (gift).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS spin_settings (
  id             INTEGER PRIMARY KEY DEFAULT 1,
  enabled        BOOLEAN DEFAULT false,
  -- content shown on the app's spin screen
  title          TEXT DEFAULT 'Daily Spin',
  subtitle       TEXT DEFAULT 'One free spin, every day.',
  intro          TEXT DEFAULT '',
  image_url      TEXT DEFAULT '',
  win_message    TEXT DEFAULT 'Congratulations!',
  lose_message   TEXT DEFAULT 'No luck this time — come back tomorrow.',
  terms          JSONB DEFAULT '[]'::jsonb,   -- ["bullet", "bullet", ...]
  -- rules
  cooldown_hours INTEGER DEFAULT 24,          -- rolling window since the last spin
  voucher_days   INTEGER DEFAULT 30,          -- default validity; a prize may override
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT spin_settings_singleton CHECK (id = 1)
);
INSERT INTO spin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_spin_settings_updated ON spin_settings;
CREATE TRIGGER trg_spin_settings_updated
  BEFORE UPDATE ON spin_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The slices. `type` decides what winning it is worth:
--   percent        value = % off the items subtotal (max_discount caps it)
--   amount         value = $ off the items subtotal
--   free_delivery  waives the delivery fee on the next order
--   gift           a physical item — no checkout effect, staff fulfil it
--   none           a "try again" slice; wins nothing, mints no voucher
CREATE TABLE IF NOT EXISTS spin_prizes (
  id           SERIAL PRIMARY KEY,
  label        TEXT NOT NULL,                  -- the text on the slice, e.g. "10% OFF"
  description  TEXT DEFAULT '',                -- the line shown on the win screen
  type         TEXT NOT NULL DEFAULT 'none',
  value        NUMERIC(10,2) DEFAULT 0,
  min_order    NUMERIC(10,2) DEFAULT 0,        -- voucher needs at least this subtotal
  max_discount NUMERIC(10,2) DEFAULT 0,        -- cap on a percent voucher (0 = uncapped)
  valid_days   INTEGER DEFAULT 0,              -- 0 = inherit spin_settings.voucher_days
  color        TEXT DEFAULT '#A41E22',         -- slice fill
  weight       INTEGER DEFAULT 1,              -- relative odds (0 = never drawn)
  stock        INTEGER DEFAULT -1,             -- -1 unlimited, else remaining awards
  awarded      INTEGER DEFAULT 0,              -- lifetime count, for the admin
  sort         INTEGER DEFAULT 0,
  visible      BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spin_prizes_sort ON spin_prizes(sort, id);

DROP TRIGGER IF EXISTS trg_spin_prizes_updated ON spin_prizes;
CREATE TRIGGER trg_spin_prizes_updated
  BEFORE UPDATE ON spin_prizes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every spin, won or not. The most recent row for a customer is the cooldown
-- clock, so this table must never be pruned per-customer without accepting that
-- it grants a free spin.
CREATE TABLE IF NOT EXISTS spin_spins (
  id          BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  prize_id    INTEGER REFERENCES spin_prizes(id) ON DELETE SET NULL,
  prize_label TEXT DEFAULT '',                 -- snapshot: survives prize edits
  prize_type  TEXT DEFAULT 'none',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spin_spins_customer ON spin_spins(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spin_spins_created  ON spin_spins(created_at DESC);

-- A staff-granted second chance. The cooldown clock ignores every spin taken
-- before a customer's most recent reset, so granting one moves the starting
-- line instead of erasing history: the spin log still records what they spun
-- and won, and the reset itself is a row somebody can audit later.
CREATE TABLE IF NOT EXISTS spin_resets (
  id          BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note        TEXT DEFAULT '',                 -- why staff gave it back
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spin_resets_customer ON spin_resets(customer_id, created_at DESC);

-- A won (or admin-granted) reward. Bound to one account, single use. The money
-- fields are snapshotted from the prize so editing or deleting a prize later
-- never changes what an outstanding voucher is worth.
CREATE TABLE IF NOT EXISTS vouchers (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,           -- e.g. SPIN-7K4Q2M
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source       TEXT DEFAULT 'spin',            -- spin | admin
  spin_id      BIGINT REFERENCES spin_spins(id) ON DELETE SET NULL,
  prize_id     INTEGER REFERENCES spin_prizes(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,                  -- percent | amount | free_delivery | gift
  value        NUMERIC(10,2) DEFAULT 0,
  min_order    NUMERIC(10,2) DEFAULT 0,
  max_discount NUMERIC(10,2) DEFAULT 0,
  label        TEXT DEFAULT '',
  description  TEXT DEFAULT '',
  -- active   → spendable (or, for a gift, awaiting staff)
  -- used     → consumed by order_id
  -- fulfilled→ a gift the staff handed over
  -- cancelled→ voided in the admin
  -- (expiry is derived from expires_at, not stored as a status)
  status       TEXT DEFAULT 'active',
  order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  admin_note   TEXT DEFAULT '',
  expires_at   TIMESTAMPTZ,                    -- null = never expires
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vouchers_customer ON vouchers(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_status   ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_created  ON vouchers(created_at DESC);

DROP TRIGGER IF EXISTS trg_vouchers_updated ON vouchers;
CREATE TRIGGER trg_vouchers_updated
  BEFORE UPDATE ON vouchers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- What a voucher took off this order, snapshotted like delivery_fee and VAT so
-- a later change to the voucher can never rewrite what the customer was charged.
-- The amount owed is subtotal + delivery_fee + vat_amount - discount_amount.
-- Existing orders default to 0, leaving their totals untouched.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_code    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_id      INTEGER REFERENCES vouchers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_voucher ON orders(voucher_id);
