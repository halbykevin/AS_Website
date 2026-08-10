-- ===========================================================================
-- AS Points — the loyalty programme.
--
-- Spend money, collect points; trade a block of points for a reward you spend
-- at checkout. Split out like spin.sql because it is a self-contained domain,
-- and it is applied *after* spin.sql: redeeming mints a row in `vouchers`, so
-- that table has to exist first.
--
-- Two tables, and the second one is the whole design:
--
--   loyalty_settings  one row (id = 1) — the CMS-driven copy and, more
--                     importantly, the three numbers that define the deal:
--                     how many points a dollar earns, how many points make a
--                     redeemable block, and what a block is worth.
--
--   loyalty_ledger    every movement, signed. + for earned, − for spent.
--                     There is deliberately **no balance column anywhere**:
--                     a balance is SUM(points), so it cannot drift out of step
--                     with its own history, and every point a customer holds
--                     can be traced to the order that paid for it.
--
-- Earning is *reconciled*, not appended: `syncOrderPoints()` in loyalty.js
-- compares what an order should have awarded against what it already has and
-- writes the difference. That is what makes delivered → cancelled → delivered
-- land on the right number instead of paying twice.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS loyalty_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  enabled       BOOLEAN DEFAULT false,
  -- content shown on the points screen in the app and on the website
  title         TEXT DEFAULT 'AS Points',
  subtitle      TEXT DEFAULT 'Earn points on every order.',
  intro         TEXT DEFAULT '',
  terms         JSONB DEFAULT '[]'::jsonb,      -- ["bullet", "bullet", ...]

  -- The deal. Defaults spell out "$1 = 1 point, 1,000 points = $50".
  earn_rate     NUMERIC(10,4) DEFAULT 1,        -- points per $1 of item spend
  redeem_block  INTEGER DEFAULT 1000,           -- the smallest redeemable amount, and the step
  redeem_value  NUMERIC(10,2) DEFAULT 50,       -- what one block is worth, in $
  max_blocks    INTEGER DEFAULT 0,              -- cap per redemption (0 = no cap)
  min_order     NUMERIC(10,2) DEFAULT 0,        -- minimum cart on the reward this mints
  voucher_days  INTEGER DEFAULT 0,              -- reward validity (0 = never expires)

  -- When an order's points actually land:
  --   delivered  the parcel arrived            (default — COD can be refused at the door)
  --   confirmed  the order was confirmed/paid
  --   created    the moment the order is placed
  -- Anything cancelled takes its points back either way.
  award_on      TEXT DEFAULT 'delivered',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT loyalty_settings_singleton CHECK (id = 1)
);
INSERT INTO loyalty_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_loyalty_settings_updated ON loyalty_settings;
CREATE TRIGGER trg_loyalty_settings_updated
  BEFORE UPDATE ON loyalty_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per movement. `points` is signed, and the balance is their sum.
--   earn    + an order qualified
--   revoke  − an order that had earned stopped qualifying (cancelled, or the
--             rule changed) — the correcting entry, never a deletion
--   redeem  − traded for the reward in voucher_id
--   adjust  ± staff, by hand, with a note saying why
--
-- Nothing here is ever updated or deleted: a correction is another row. That is
-- what lets the customer's history be shown to them verbatim.
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id          BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'earn',
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  voucher_id  INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',                  -- the line the customer reads
  admin_note  TEXT DEFAULT '',                  -- staff-only
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- The balance query: every read is "this customer's rows".
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON loyalty_ledger(customer_id, created_at DESC);
-- syncOrderPoints() looks its own history up by order.
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order    ON loyalty_ledger(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_created  ON loyalty_ledger(created_at DESC);

-- Points redemptions mint vouchers alongside the Daily Spin's, so the checkout
-- rules stay in one place. `source` tells them apart: 'spin' | 'admin' | 'points'.
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS points_spent INTEGER NOT NULL DEFAULT 0;
