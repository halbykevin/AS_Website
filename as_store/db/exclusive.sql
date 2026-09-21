-- ===========================================================================
-- AS Store — exclusive items (products sold on their own terms)
-- Idempotent: safe to run more than once. Applied by server/src/migrate.js.
-- ===========================================================================
--
-- An "exclusive" product opts out of the store's rules as a set, because they
-- only make sense together: a software licence has nothing to deliver, nothing
-- to tax at the door, and no cash for a driver to collect. One flag rather than
-- four columns, so a product cannot end up half-exempt — VAT off but delivery
-- still charged — and so every layer can ask the same single question.
--
-- What `exclusive` turns off, all of it enforced in POST /api/orders:
--   * VAT            — no tax line, whatever settings.vat_percent says
--   * delivery       — no fee and no free-delivery threshold to reach
--   * cash on delivery — Whish Pay only; there is no parcel to pay for
--   * AS Wallet      — earns no credit, and credit cannot pay for one
--   * Daily Spin vouchers — no discount applies
--   * the 2-per-product bag cap — `max_qty` replaces it
--
-- An exclusive item is also bought ON ITS OWN. Mixing one into a bag of
-- physical goods would mean pro-rating every rule above across the lines —
-- VAT on half the subtotal, delivery on the other half, credit earned on part
-- of it — and each of those is a place for the figure on screen to drift from
-- the figure charged. The server refuses the mix outright and both checkouts
-- say so before it gets that far.

-- --- Products --------------------------------------------------------------

ALTER TABLE products ADD COLUMN IF NOT EXISTS exclusive BOOLEAN DEFAULT false;

-- Quantity bounds for this product. NULL on both means "the store default",
-- which is the 2-per-product cap the bag has always enforced (MAX_ITEM_QTY in
-- server/src/app.js). They are deliberately independent of `exclusive`: a
-- normal product may want a cap of 5, and an exclusive one may want no bulk at
-- all. The API resolves them to real numbers before any client sees them, so
-- nothing downstream has to know what the default is.
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_qty INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_qty INTEGER;

-- The smallest quantity this product can be bought in. NULL means 1 — whole
-- units, which is the only sane answer for anything with a box: nobody buys
-- 1.5 laptops.
--
-- 0.01 makes the quantity an AMOUNT rather than a count. At $1 a licence that
-- is the whole point of RaiOne: someone settling $7.50 types 7.5, and a step of
-- 1 would round that to a figure they do not owe. It is a separate column from
-- `exclusive` because it answers a different question — `exclusive` is about
-- tax, delivery and payment, this is about what a quantity even means here —
-- and an exclusive product sold in whole units is perfectly reasonable.
ALTER TABLE products ADD COLUMN IF NOT EXISTS qty_step NUMERIC(10,2);

-- Fractional quantities need columns that can hold them. Guarded so a migration
-- that has already run does not rewrite the table again on every deploy.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'min_qty') <> 'numeric' THEN
    ALTER TABLE products ALTER COLUMN min_qty TYPE NUMERIC(10,2);
    ALTER TABLE products ALTER COLUMN max_qty TYPE NUMERIC(10,2);
  END IF;
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_name = 'order_items' AND column_name = 'qty') <> 'numeric' THEN
    -- What was actually bought, and the multiplier behind every line total on
    -- an invoice. An INTEGER here would silently truncate 7.5 to 7 and charge
    -- fifty cents less than the customer agreed to.
    ALTER TABLE order_items ALTER COLUMN qty TYPE NUMERIC(10,2);
  END IF;
END $$;

-- --- Orders ----------------------------------------------------------------

-- Snapshotted onto the order like the delivery fee and the VAT rate, for the
-- same reason: the wallet reconciles an order's earnings long after it was
-- placed (syncOrderWallet can run on any status change), and re-reading the
-- product's flag then would rewrite history the day someone un-flags it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exclusive BOOLEAN DEFAULT false;

-- --- RaiOne ----------------------------------------------------------------
--
-- $1 per licence, so the quantity a customer types IS the amount they pay:
-- someone settling $130 sets it to 130 and Whish collects $130.00 exactly, with
-- no VAT on top to make it $132.60. A step of 0.01 means any amount to the cent
-- works — 7.5 is $7.50 — and the $5 floor is the smallest order taken.
--
-- `visible = false` makes it unlisted rather than hidden: the shop grid, search,
-- the category pages, the sitemap and the Google Merchant feed all filter on
-- that column, while GET /api/products/:slug deliberately does not.
--
-- The API alone is NOT enough, though: loadProduct() in src/lib/catalog.js 404s
-- every hidden product (that is how the catalog sync retires one) and had to be
-- excepted for exclusive products, or this row would have a working API
-- response and a dead page. See the note there.
--
-- Flipping Visible on in the admin puts it in the catalogue like any product.
--
-- ON CONFLICT DO NOTHING: after the first run this row belongs to the admin.
-- Re-running a migration must never reset a price or a cap someone has changed.
-- `stock` is deliberately left at the column default. It is not an inventory
-- system: the column exists but is not maintained anywhere in this catalogue
-- (every other row sits at 0), nothing decrements it on an order, and checkout
-- does not consult it — see the note above availability() in
-- as_store/src/lib/merchant.js. A licence has nothing to count anyway. An
-- earlier version of this file seeded 10,000 here, which made RaiOne the only
-- row in the shop carrying a number that looked like a limit it could run out
-- of, and was the one figure on the product that meant nothing.
INSERT INTO products (name, slug, tagline, description, price,
                      visible, exclusive, min_qty, max_qty, qty_step, is_new, featured)
VALUES ('RaiOne', 'RaiOne', 'License Software', 'License Software', 1,
        false, true, 5, 10000, 0.01, false, false)
ON CONFLICT (slug) DO NOTHING;

-- An earlier run of this file created RaiOne with a floor of 1 and no step, so
-- a database migrated before fractional quantities existed would keep them.
-- Narrowly guarded on exactly those values: the moment anyone has edited the
-- row in the admin this matches nothing and leaves their numbers alone, which
-- is the same promise the ON CONFLICT above makes.
UPDATE products
   SET min_qty = 5, qty_step = 0.01
 WHERE slug = 'RaiOne' AND min_qty = 1 AND max_qty = 10000 AND qty_step IS NULL;

-- Same story for the stock figure that earlier version seeded: cleared only
-- where it is still exactly the number this file wrote, so a real count someone
-- has since typed is never wiped.
UPDATE products
   SET stock = 0
 WHERE slug = 'RaiOne' AND stock = 10000;
