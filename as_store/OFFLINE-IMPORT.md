# Importing a catalog when the shop blocks the server

The admin **Import products** page runs the scraper *on the VPS*. When the source
shop blocks that IP, the run comes back empty and there is nothing the admin UI can
do about it. The answer is to **scrape from a machine that is not blocked (your
laptop) and push the result to production.**

## One command

```powershell
cd as_store
npm run sync-catalog
```

[`scripts/sync-catalog.mjs`](scripts/sync-catalog.mjs) does the whole thing: scrapes
the shop, downloads the photos, sends up only the ones the server doesn't already
have, backs the live database up, shows you a dry run, asks, then imports and clears
the storefront cache. It reads the VPS target from `deploy.env`, the same file
`npm run deploy` uses.

```
--url <url>     shop to scrape         (default https://pacmax.me)
--mode <mode>   site | auto | crawl | single   (default site = whole catalog)
--limit <n>     stop after n products
--reuse <dir>   skip the scrape, use a run folder you already have
--dry-run       stop after showing what would change
--yes           don't ask before writing
--deploy        ship the import tool to the VPS first, if it isn't there yet
```

**The very first run needs `--deploy`**, because the VPS only ever gets code by
pulling the branch:

```powershell
npm run sync-catalog -- --deploy
```

That commits the tooling files (it lists them and asks first — never a blanket
`git add -A`), pushes, and runs the store deploy. After that one time,
`npm run sync-catalog` is the whole job.

Under it sits the same ingest the admin tool uses
([`server/src/scraper.js`](server/src/scraper.js) → `ingestProducts`), driven by
[`server/src/import-scrape.js`](server/src/import-scrape.js) — which you can also run
by hand; see [Doing it step by step](#doing-it-step-by-step).

## What it will and will not touch

The import is **additive**. It only ever inserts what is missing and updates the
product fields the scrape owns:

| Live data | What the import does |
|---|---|
| **Category & subcategory images** (`categories.image_url`) | **Never written**, and verified afterwards — see the safety net below. A category is matched by slug; a slug that already exists keeps its image, its name, its tagline, sort order, visibility and nav flag. Only a genuinely new slug is inserted (with an empty image). |
| Existing product images | Kept. New photos are added to the gallery, duplicates are ignored (`ON CONFLICT DO NOTHING`) — nothing is replaced. The **one** deletion the import performs is placeholder images; see below. |
| Products, brands | Matched on `source_url`, so a re-run updates instead of duplicating. Name, tagline, description, specs and price are overwritten from the scrape. |
| Product category | **Overwritten** when the scrape has one. This is the single manual edit a re-import can undo — if you re-filed a product by hand in the admin, it moves back. |
| Orders, customers, settings, homepage | Untouched. |

### The category safety net

Because those hand-uploaded category images are the thing that cannot be re-made,
the import does not rely on good intentions. Every run:

1. **snapshots** every category (name, slug, image, tagline, sort, visibility, nav
   flag, parent) and writes `categories-backup-<timestamp>.sql` next to your
   `products.json` — a one-command restore: `psql "$DATABASE_URL" -f <that file>`;
2. **re-reads** them afterwards and **puts back** any field that changed, naming
   each one in the output;
3. prints `N with an image (was N) — none lost` as the last line.

There is one field this legitimately catches: a category you created as a
top-level department, which the source shop files as a subcategory, would have its
parent set. The guard restores that too, so your menu structure stays yours.

### Placeholder images

A shop with no photo for a product shows its **own logo** instead — pacmax.me
serves `PACMAC.png` that way, on 11 products. Importing that would put a
competitor's logo on AS Store product pages, so the import:

- **never stores** an image whose URL matches a placeholder pattern (and never
  wastes bandwidth downloading one), and
- **deletes** any such row an earlier import already saved — matching both the
  source URL and its localized `scrape-<hash>` copy. This is the only `DELETE`
  in the whole import, and it can only ever hit a row whose url is a known
  placeholder.

The patterns live in [`server/src/scraper.js`](server/src/scraper.js)
(`isPlaceholderImage`): the pacmax logo, `woocommerce-placeholder`, `placeholder`,
`no-image`, `coming-soon`, `default-product`. Add site-specific ones without
touching code via `PLACEHOLDER_IMAGE_PATTERNS` in the API's `.env` (comma-separated
regexes).

A product left with no photo renders the **AS Store mark** instead
([`src/lib/productImage.js`](src/lib/productImage.js)) — necessary, not cosmetic:
`next/image` throws on an empty `src`, so the shop and category pages would fail
to render without it.

> **Do not do this by restoring a database dump.** Loading a local `as_store` dump
> over production replaces every table — that is exactly how the category images you
> uploaded (and the orders, and the customers) would be lost. Ship the scrape's
> `products.json` instead; that is what the steps below do.

`--dry-run` prints the same accounting for your actual file before anything is written.

## Doing it step by step

Everything below is what `npm run sync-catalog` runs for you — useful when a step
fails, or when you want to drive it yourself.

### One-time: get the script onto the VPS

```powershell
git add -A ; git commit -m "offline catalog import" ; git push
npm run deploy:store     # from the repo root
```

### 1. Scrape — on your laptop

```powershell
cd as_store\scraper
pip install -r requirements.txt          # first time only
python scrape.py --site https://pacmax.me --out ..\..\run --name products --format json
```

`--site` walks the whole catalog. The other modes match the admin page's dropdown:
`--auto <url>` (detect), `--crawl <url>` (one category), `--url <url>` (one product).
Add `--limit 20` for a trial run, `--render` for a JavaScript-only shop.

You end up with `run\products.json` — the only file that matters.

### 2. Download the photos — on your laptop

```powershell
cd ..\server
node src/import-scrape.js ..\..\run\products.json --stage-images ..\..\run\stage
```

This is the step that makes the whole thing work: it saves every product photo under
the exact content-addressed name the ingest looks for (`scrape-<hash>.<ext>`), so on
the VPS the images are already on disk and the blocked shop is never contacted.
Re-run it to retry anything that failed — finished files are skipped.

### 3. Upload both to the VPS

```powershell
$key = "C:\Users\Admin\.ssh\id_ed25519"
$vps = "root@95.217.2.105"

tar -czf run\stage.tar.gz -C run\stage .
scp -i $key run\stage.tar.gz run\products.json "${vps}:/tmp/"
```

Then connect (`ssh -i $key $vps`) and unpack into the uploads folder the API actually
serves — read it from the `.env` rather than assuming, it does not live next to the code:

```bash
cd /opt/as-company/as_store/server
grep UPLOAD_DIR .env                     # e.g. /var/www/.../store-api.as.com.lb/uploads
tar -xzf /tmp/stage.tar.gz -C "$(grep -oP '(?<=^UPLOAD_DIR=).*' .env)"
```

### 4. Import — on the VPS

Take a backup first; it costs seconds and it is the only real undo:

```bash
cd /opt/as-company/as_store/server
pg_dump "$(grep -oP '(?<=^DATABASE_URL=).*' .env)" > /tmp/as_store-before-import.sql

node src/import-scrape.js /tmp/products.json --dry-run    # what it would change
node src/import-scrape.js /tmp/products.json --purge      # do it
```

`--purge` clears the storefront's SSR cache so the new products appear immediately;
without it they can take up to an hour (or until the next admin save) to show up.

### Options for import-scrape.js

```
node src/import-scrape.js <products.json | run-dir> [options]

  --stage-images <dir>  Only download the photos, into <dir>. Never touches the DB.
  --dry-run             Report what the import would change. Read-only.
  --purge               Purge the storefront cache after a successful import.
  --workers <n>         Parallel image downloads (default 6).
  --limit <n>           Only handle the first n products of the file.
```

A previous run's folder works as the argument too — `server/scrapes/<job-id>` is where
the admin tool leaves its `products.json`.
