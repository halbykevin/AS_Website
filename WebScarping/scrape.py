#!/usr/bin/env python3
"""Command-line e-commerce scraper.

Examples
--------
  # One product page, all formats, with images:
  python scrape.py --url https://store.example.com/products/widget --images

  # Many URLs from a file:
  python scrape.py --urls urls.txt --format json csv xlsx

  # Crawl a category/collection page for product links, then scrape each:
  python scrape.py --crawl https://store.example.com/collections/all --images

  # Site that needs custom selectors and/or JavaScript:
  python scrape.py --url https://store.example.com/p/123 --config config.yaml --render
"""

from __future__ import annotations

import argparse
import sys

import yaml

# Windows consoles default to cp1252, which crashes on the non-ASCII characters
# common in product names. Make stdout/stderr UTF-8-safe.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from ecom_scraper import extract, runner
from ecom_scraper.export import export
from ecom_scraper.fetch import Fetcher


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description="Scrape e-commerce product data and images.")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="A single product page URL.")
    src.add_argument("--urls", help="Path to a text file with one URL per line.")
    src.add_argument("--crawl", help="A listing/category page; auto-discover product links.")
    src.add_argument("--auto", help="A URL to auto-detect: scrape it as a single product "
                     "page, or crawl it as a category page.")

    ap.add_argument("--config", help="YAML config with custom CSS selectors / settings.")
    ap.add_argument("--out", default="output", help="Output directory (default: output).")
    ap.add_argument("--name", default="products", help="Base filename for exports.")
    ap.add_argument("--format", nargs="+", default=["json", "csv", "xlsx", "html"],
                    choices=["json", "csv", "xlsx", "excel", "html"], help="Export formats.")
    ap.add_argument("--images", action="store_true", help="Download product images "
                    "(image URLs are always included in the export either way).")
    ap.add_argument("--render", action="store_true", help="Use a headless browser (JS sites).")
    ap.add_argument("--delay", type=float, default=0.2, help="Seconds between requests.")
    ap.add_argument("--workers", type=int, default=8, help="Parallel fetches (default 8).")
    ap.add_argument("--limit", type=int, default=0, help="Max products (0 = no limit).")
    ap.add_argument("--no-pagination", action="store_true",
                    help="Do not follow 'Next' pages when crawling (first page only).")
    ap.add_argument("--max-pages", type=int, default=50, help="Page cap when crawling.")
    ap.add_argument("--link-pattern", help="Regex for product links when crawling.")
    ap.add_argument("--no-robots", action="store_true", help="Do not honor robots.txt.")
    return ap.parse_args(argv)


def load_config(path: str | None) -> dict:
    if not path:
        return {}
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def collect_urls(args, fetcher, link_pattern, selectors=None) -> list[str]:
    if args.url:
        return [args.url]
    if args.urls:
        with open(args.urls, encoding="utf-8") as fh:
            return [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]
    if args.crawl:
        print(f"Crawling for product links: {args.crawl}")
        return runner.collect_product_urls(
            fetcher, args.crawl,
            follow_pagination=not args.no_pagination,
            max_pages=args.max_pages,
            link_pattern=link_pattern,
        )
    # --auto: probe the page and decide between single-product and crawl.
    url = args.auto
    print(f"Checking page: {url}")
    html = fetcher.get(url)
    if not html:
        return [url]
    probe = extract.parse(html, url, selectors)
    if probe.price is not None:
        print("  looks like a single product page.")
        return [url]
    if extract.find_product_links(html, url, link_pattern):
        print("  looks like a category page — collecting products…")
        return runner.collect_product_urls(
            fetcher, url,
            follow_pagination=not args.no_pagination,
            max_pages=args.max_pages,
            link_pattern=link_pattern,
        )
    print("  treating as a single page.")
    return [url]


def main(argv=None) -> int:
    args = parse_args(argv)
    config = load_config(args.config)
    selectors = config.get("selectors")
    link_pattern = args.link_pattern or config.get("link_pattern")

    fetcher = Fetcher(
        render=args.render or config.get("render", False),
        delay=args.delay,
        respect_robots=not args.no_robots,
        headers=config.get("headers"),
    )

    products = []
    try:
        urls = collect_urls(args, fetcher, link_pattern, selectors)
        if args.limit:
            urls = urls[: args.limit]
        if not urls:
            print("No URLs to scrape.")
            return 1

        print(f"Scraping {len(urls)} product(s) with {args.workers} parallel fetch(es)...")
        products = runner.scrape_products(
            fetcher, urls, args.images, args.out,
            workers=args.workers, selectors=selectors,
        )
    finally:
        fetcher.close()

    if not products:
        print("No products extracted.")
        return 1

    files = export(products, args.out, args.name, args.format)
    print(f"\nDone. {len(products)} product(s) scraped.")
    for f in files:
        print(f"  wrote {f}")
    if args.images:
        print(f"  images in {args.out}/images/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
