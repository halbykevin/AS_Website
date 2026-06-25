# AS Store — Database

PostgreSQL schema for the AS Store. Lives in its **own database `as_store`** (separate from the
marketing site's `as_company`) so the shop — and later orders/inventory/customers — stays
decoupled. (If you'd rather keep it in `as_company`, just run these scripts there and skip
"Create the database".)

## Tables

- **categories** — name, slug, tagline, image, sort, visible
- **products** — name, slug, tagline, description, price, old_price, category_id → categories,
  colors (jsonb), stock, is_new, featured, visible, sort
- **product_images** — gallery rows (product_id → products, url, alt, sort)

`updated_at` auto-touches on UPDATE via a trigger.

## Run it in pgAdmin

1. **Create the database** — right-click **Databases → Create → Database…**, name it
   `as_store`, owner `as_user` (or `postgres`), Save.
2. Select **as_store** → **Tools → Query Tool**.
3. Open **`schema.sql`** (folder icon) → **Run** (F5).
4. Open **`seed.sql`** → **Run** (optional sample catalog).
5. Verify: **as_store → Schemas → public → Tables** shows `categories`, `products`,
   `product_images`. Right-click **products → View/Edit Data → All Rows**.

## Connection string (for the store backend, next step)

```
postgres://as_user:YOUR_PASSWORD@127.0.0.1:5432/as_store
```
