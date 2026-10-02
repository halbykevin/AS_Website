-- ===========================================================================
-- AS Store — AS-Punch licence renewals paid through the store
-- Idempotent: safe to run more than once. Applied by server/src/migrate.js.
-- ===========================================================================
--
-- An AS-Punch installation's "Renew" button opens /product/RaiOne?renewal=<code>.
-- The code belongs to the AS-Punch licence server, which alone decides what one
-- month costs: the API resolves it before creating the order, prices the order
-- from that answer (never from the quantity the browser sent), and once Whish
-- confirms the payment reports it back so the licence is extended. See
-- server/src/licenseRenewal.js.
--
-- The order carries the renewal's state so a paid renewal can never be lost: a
-- licence server that is down when the payment lands is retried until it
-- answers, and the retry state lives here, beside the money.
--
--   license_renewal_status
--     NULL              — not a licence renewal (every ordinary order)
--     awaiting_payment  — order created, Whish not paid yet
--     pending           — paid; the licence server has not acknowledged it yet
--     applied           — the licence server renewed the licence
--     refused           — the licence server recorded the payment but would not
--                         renew (e.g. the licence was suspended since) — a
--                         person has to refund or renew by hand

ALTER TABLE orders ADD COLUMN IF NOT EXISTS license_renewal_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS license_renewal_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS license_renewal_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS license_renewal_next_at TIMESTAMPTZ;
-- The licence server's answer (new expiry, company name, refusal reason).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS license_renewal_result JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS license_renewal_error TEXT;

DO $$
BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_license_renewal_status_check
    CHECK (license_renewal_status IS NULL
           OR license_renewal_status IN ('awaiting_payment', 'pending', 'applied', 'refused'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The retry loop's only query.
CREATE INDEX IF NOT EXISTS idx_orders_license_renewal_pending
  ON orders (license_renewal_next_at) WHERE license_renewal_status = 'pending';
