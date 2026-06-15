"""Orchestration shared by the CLI and the GUI: collect product URLs (following
pagination) and scrape them (optionally in parallel)."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable

from . import extract
from .fetch import Fetcher
from .images import download_images
from .models import Product

Log = Callable[[str], None]


def collect_product_urls(
    fetcher: Fetcher,
    start_url: str,
    follow_pagination: bool = True,
    max_pages: int = 50,
    log: Log = print,
    link_pattern: str | None = None,
) -> list[str]:
    """Find product links on a listing page, following 'Next' through all pages."""
    links: list[str] = []
    seen_links: set[str] = set()
    seen_pages: set[str] = set()
    page_url: str | None = start_url
    page_no = 0

    while page_url and page_no < max_pages:
        page_no += 1
        seen_pages.add(page_url)
        html = fetcher.get(page_url)
        if not html:
            break
        new = [u for u in extract.find_product_links(html, page_url, link_pattern)
               if u not in seen_links]
        seen_links.update(new)
        links.extend(new)
        log(f"  page {page_no}: +{len(new)} product(s) (total {len(links)})")

        if not follow_pagination:
            break
        nxt = extract.find_next_page(html, page_url)
        page_url = nxt if (nxt and nxt not in seen_pages) else None

    if page_no >= max_pages and page_url:
        log(f"  (stopped at page limit of {max_pages}; raise it to go further)")
    return links


def _scrape_one(fetcher: Fetcher, url: str, download: bool, out_dir: str,
                selectors: dict | None = None) -> Product | None:
    html = fetcher.get(url)
    if not html:
        return None
    product = extract.parse(html, url, selectors)
    if product.is_empty():
        return None
    if download:
        download_images(product, os.path.join(out_dir, "images"), fetcher.session)
    return product


def scrape_products(
    fetcher: Fetcher,
    urls: list[str],
    download: bool,
    out_dir: str,
    workers: int = 1,
    log: Log = print,
    selectors: dict | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> list[Product]:
    """Scrape every URL. With workers > 1, fetch pages in parallel.

    `progress(done, total)` is called after each page, for a progress bar.
    """
    total = len(urls)
    products: list[Product] = []

    def report(idx: int, p: Product | None, url: str):
        if progress:
            progress(idx, total)
        if p is None:
            log(f"  [{idx}/{total}] no product data: {url}")
            return
        note = (f"{len(p.image_files)} downloaded" if download
                else f"{len(p.images)} image link(s)")
        name = (p.name or "?")[:55]
        log(f"  [{idx}/{total}] {name}  —  {p.price or '?'} {p.currency or ''}  ({note})")

    # Rendering uses one shared browser → must stay single-threaded.
    if workers <= 1 or fetcher.render:
        for idx, url in enumerate(urls, 1):
            p = _scrape_one(fetcher, url, download, out_dir, selectors)
            report(idx, p, url)
            if p:
                products.append(p)
        return products

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_scrape_one, fetcher, u, download, out_dir, selectors): u
                   for u in urls}
        for idx, fut in enumerate(as_completed(futures), 1):
            url = futures[fut]
            try:
                p = fut.result()
            except Exception as exc:
                if progress:
                    progress(idx, total)
                log(f"  [{idx}/{total}] error on {url}: {exc}")
                continue
            report(idx, p, url)
            if p:
                products.append(p)
    return products
