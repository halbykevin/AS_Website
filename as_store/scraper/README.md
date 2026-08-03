# E-commerce Scraper

A configurable Python tool that scrapes product data (name, price, SKU, brand,
description, rating, availability, images...) from e-commerce pages and exports
to **JSON, CSV and Excel** — with optional **image downloads**.

> Day to day this runs from the admin **Import products** page, on the VPS. If the
> shop blocks that IP, scrape from your laptop and push the result up instead —
> see [OFFLINE-IMPORT.md](../OFFLINE-IMPORT.md).

It works on most stores with **zero configuration** by reading the structured
data they already embed (`schema.org/Product` JSON-LD and Open Graph tags).
For sites that lack it, you supply **CSS selectors** in a YAML config. For
JavaScript-rendered sites, add `--render` to drive a headless browser.

## Setup

```powershell
pip install -r requirements.txt

# Only if you'll use --render (JavaScript sites):
playwright install chromium
```

## Usage

```powershell
# One product page → JSON + CSV + Excel, and download its images
python scrape.py --url https://store.example.com/products/widget --images

# Many URLs listed in a file (one per line)
python scrape.py --urls urls.txt

# Crawl a category/collection page, find product links, scrape each
python scrape.py --crawl https://store.example.com/collections/all --images

# Pick formats
python scrape.py --url <URL> --format json xlsx

# Site needing custom selectors and/or JS rendering
python scrape.py --url <URL> --config config.yaml --render
```

### Key options

| Option | Meaning |
|---|---|
| `--url` / `--urls` / `--crawl` | single page / file of URLs / discover links from a listing page |
| `--images` | also download image files (URLs are always in the export) |
| `--format` | any of `json csv xlsx` (default: all three) |
| `--workers` | parallel page fetches (default 8 — the main speed lever) |
| `--no-pagination` | when crawling, only the first page (default: follow every "Next") |
| `--max-pages` | safety cap on pages to follow (default 50) |
| `--render` | use a headless browser for JavaScript pages |
| `--config` | YAML file with CSS selectors (see `config.example.yaml`) |
| `--delay` | seconds between requests (default 0.2) |
| `--limit` | cap number of products |
| `--out` / `--name` | output folder / base filename |
| `--no-robots` | skip robots.txt checks (use responsibly) |

**Whole catalog, fast.** When crawling a category, the scraper automatically
follows the "Next" link through **every page** and fetches products in parallel.
Example — grab an entire category to Excel:

```powershell
python scrape.py --crawl https://store.example.com/laptops/ --workers 10 --format xlsx
```

## Output

```
output/
  products.json     # full structured records (nested lists kept)
  products.csv      # one row per product (Excel-friendly UTF-8)
  products.xlsx     # spreadsheet
  images/           # downloaded image files (only if you chose to download)
```

**Image links vs. files.** Every product's image **URLs are always included** in the
exports (the `images` column / array) — so you can get just the links without
downloading anything. In the app, choose **Images: Links only** (default) or
**Download image files**. On the CLI, add `--images` to also download the files;
omit it to keep links only.

## How extraction works

For each page the scraper runs three strategies and merges the results, so each
field is filled by the first source that has it:

1. **JSON-LD** `schema.org/Product` — most reliable, present on most modern stores.
2. **Open Graph / meta tags** — title, image, price fallbacks.
3. **Custom CSS selectors** — from your `--config`, for anything still missing.

If a page yields nothing useful, it's skipped (and reported).

## Please scrape responsibly

- Only scrape sites you own or have permission to scrape. Many stores prohibit
  scraping in their Terms of Service.
- The tool honors `robots.txt` by default and throttles requests. Keep `--delay`
  reasonable and don't hammer servers.
- Respect copyright on product data and images.
