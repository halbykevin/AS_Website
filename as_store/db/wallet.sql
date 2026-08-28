-- ===========================================================================
-- AS Wallet — store credit, and what replaced AS Points.
--
-- Same deal as before, told in the only unit a customer ever has to convert:
-- money. Spend $1,000, get $50 back in your wallet, spend it on the next order.
-- Nobody has to be told what a point is worth, and nothing has to be "redeemed"
-- into something else first — the balance IS the money.
--
-- Applied after spin.sql (it touches `orders`, and shares checkout with the
-- vouchers that live there) and after loyalty.sql, whose balances it converts
-- once and then leaves alone. The `loyalty_*` tables are retained but never
-- read again, the way `reservations` is on the marketing site: the history a
-- customer earned is worth keeping even once nothing queries it.
--
-- Two tables, and the second one is still the whole design:
--
--   wallet_settings  one row (id = 1) — the CMS copy and the three numbers that
--                    define the deal: what percentage of a spend comes back,
--                    the smallest order the wallet may be spent on, and the
--                    most of one order it may cover.
--
--   wallet_ledger    every movement, signed, in dollars. There is deliberately
--                    **no balance column anywhere**: a balance is SUM(amount),
--                    so it cannot drift out of step with its own history, and
--                    every cent a customer holds traces to the order that
--                    earned it or the order that spent it.
--
-- Earning is *reconciled*, not appended: `syncOrderWallet()` in wallet.js
-- compares what an order should have credited against what it already has and
-- writes the difference. That is what makes delivered → cancelled → delivered
-- land on the right balance instead of paying twice.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS wallet_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  enabled       BOOLEAN DEFAULT false,
  -- content shown on the wallet screen in the app and on the website
  title         TEXT DEFAULT 'AS Wallet',
  subtitle      TEXT DEFAULT 'Money back on every order.',
  intro         TEXT DEFAULT '',
  terms         JSONB DEFAULT '[]'::jsonb,      -- ["bullet", "bullet", ...]

  -- The deal. The default spells out "spend $1,000, get $50 back".
  earn_percent  NUMERIC(6,3) DEFAULT 5,         -- % of item spend credited back
  min_order     NUMERIC(10,2) DEFAULT 0,        -- smallest order the wallet may pay for
  max_percent   INTEGER DEFAULT 100,            -- most of one order the wallet may cover

  -- When an order's credit actually lands:
  --   delivered  the parcel arrived            (default — COD can be refused at the door)
  --   confirmed  the order was confirmed/paid
  --   created    the moment the order is placed
  -- Anything cancelled takes its credit back either way.
  award_on      TEXT DEFAULT 'delivered',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT wallet_settings_singleton CHECK (id = 1)
);
INSERT INTO wallet_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_wallet_settings_updated ON wallet_settings;
CREATE TRIGGER trg_wallet_settings_updated
  BEFORE UPDATE ON wallet_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per movement, in dollars. `amount` is signed, and the balance is
-- their sum.
--   earn    + an order qualified
--   revoke  − an order that had earned stopped qualifying (cancelled, or the
--             rule changed) — the correcting entry, never a deletion
--   spend   − paid towards an order at checkout
--   refund  + a spend given back (the order was cancelled, or never happened)
--   adjust  ± staff, by hand, with a note saying why
--
-- Nothing here is ever updated or deleted except to stamp an order id onto a
-- spend once that order exists: a correction is another row. That is what lets
-- the customer's history be shown to them verbatim.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id          BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'earn',
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',                  -- the line the customer reads
  admin_note  TEXT DEFAULT '',                  -- staff-only
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- The balance query: every read is "this customer's rows".
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_customer ON wallet_ledger(customer_id, created_at DESC);
-- syncOrderWallet() looks its own history up by order.
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_order    ON wallet_ledger(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created  ON wallet_ledger(created_at DESC);

-- What the wallet paid towards an order, snapshotted like the delivery fee and
-- the VAT so a later settings change cannot rewrite what this customer paid.
-- It is a *payment*, not a discount: it comes off after VAT, which is charged
-- on the goods whoever's money buys them.
--   total = subtotal + delivery + VAT − discount − wallet_amount
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- One-time conversion of AS Points balances into wallet credit.
--
-- Runs at most once — the sentinel note is the guard, so re-running migrate is
-- safe — and only where the old tables exist at all. Each customer is credited
-- what their points were actually worth at the old rate, pro-rata rather than
-- in whole blocks: the block rule existed to stop a fraction of a reward being
-- redeemed, and there are no blocks any more.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  blk NUMERIC;
  val NUMERIC;
BEGIN
  IF to_regclass('public.loyalty_ledger') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM wallet_ledger WHERE admin_note = 'points-migration') THEN RETURN; END IF;

  SELECT GREATEST(1, COALESCE(redeem_block, 1000)), COALESCE(redeem_value, 50)
    INTO blk, val
    FROM loyalty_settings WHERE id = 1;
  IF blk IS NULL THEN blk := 1000; val := 50; END IF;

  INSERT INTO wallet_ledger (customer_id, amount, kind, description, admin_note)
  SELECT l.customer_id,
         round(SUM(l.points) * val / blk, 2),
         'adjust',
         'AS Points converted to wallet credit',
         'points-migration'
    FROM loyalty_ledger l
   GROUP BY l.customer_id
  HAVING round(SUM(l.points) * val / blk, 2) <> 0;
END $$;
