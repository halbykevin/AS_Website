"""Orchestration shared by the CLI and the GUI: collect product URLs (following
pagination) and scrape them (optionally in parallel)."""

from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable
from urllib.parse import urljoin, urlparse

from . import extract
from .fetch import Fetcher
from .images import download_images
from .models import Product

Log = Callable[[str], None]

# URLs that look like individual product pages (across common platforms).
_PRODUCT_HINT = re.compile(r"[?&]product=|/product/|/products/|/p/|/item/", re.I)

# Where a store's full product list typically lives, tried in order.
_SITEMAP_CANDIDATES = [
    "/product-sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap.xml",
]
_ARCHIVE_CANDIDATES = [
    "/?post_type=product",   # WooCommerce, plain permalinks
    "/shop/", "/shop",       # WooCommerce, pretty permalinks
    "/products", "/products/",
    "/collections/all",      # Shopify
    "/store", "/store/",
]


def _origin(url: str) -> str:
    p = urlparse(url if "//" in url else "https://" + url)
    return f"{p.scheme}://{p.netloc}"


# Links that look like category/collection listing pages.
_CATEGORY_HINT = re.compile(r"[?&]product_cat=|/product-category/|/collections/", re.I)


def _category_urls(html: str, base_url: str) -> list[str]:
    """Absolute category-listing URLs found on a page (e.g. the homepage)."""
    cats: list[str] = []
    for href in re.findall(r'href=["\']([^"\']+)["\']', html, re.I):
        if _CATEGORY_HINT.search(href):
            cats.append(urljoin(base_url, href.replace("&amp;", "&")))
    return list(dict.fromkeys(cats))


def _sitemap_product_urls(fetcher: Fetcher, origin: str, log: Log) -> list[str]:
    """Pull product URLs from a sitemap (recursing a sitemap index if needed)."""
    for path in _SITEMAP_CANDIDATES:
        xml = fetcher.get(origin + path)
        if not xml or "<loc" not in xml.lower():
            continue
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml, re.I)
        product_maps = [l for l in locs if "product" in l.lower() and l.lower().endswith(".xml")]
        urls: list[str] = []
        if product_maps:
            for pm in product_maps:
                xml2 = fetcher.get(pm)
                if xml2:
                    urls += [u for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml2, re.I)
                             if _PRODUCT_HINT.search(u)]
        else:
            urls = [u for u in locs if _PRODUCT_HINT.search(u)]
        urls = list(dict.fromkeys(urls))
        if urls:
            log(f"  found {len(urls)} product URL(s) via {path}")
            return urls
    return []


def resolve_site_urls(
    fetcher: Fetcher,
    domain: str,
    follow_pagination: bool = True,
    max_pages: int = 200,
    log: Log = print,
    link_pattern: str | None = None,
    limit: int = 0,
    workers: int = 1,
) -> list[str]:
    """Given a site's domain, discover every product URL across the whole catalog.

    Strategy: sitemap → known product-archive paths (crawled with pagination) →
    fall back to crawling the homepage. `limit` > 0 stops collection early.
    With workers > 1, category pages are crawled in parallel.
    """
    origin = _origin(domain)
    log(f"Scanning whole site: {origin}")

    # 1) Sitemap is the cleanest source when available.
    urls = _sitemap_product_urls(fetcher, origin, log)
    if urls:
        return urls[:limit] if limit else urls

    # 2) Enumerate category pages from the homepage and crawl each — most reliable
    #    for stores whose global archive paginates poorly.
    home = fetcher.get(origin + "/")
    if home:
        cat_urls = _category_urls(home, origin + "/")
        if len(cat_urls) >= 3:
            log(f"  found {len(cat_urls)} category page(s); crawling each")
            all_urls: list[str] = []
            seen: set[str] = set()

            def crawl_cat(cat: str) -> list[str]:
                return collect_product_urls(
                    fetcher, cat, follow_pagination=follow_pagination,
                    max_pages=max_pages, log=log, link_pattern=link_pattern,
                )

            if workers > 1 and not fetcher.render and not limit:
                # Pagination within one category is inherently sequential (page N
                # links page N+1), but separate categories are independent.
                with ThreadPoolExecutor(max_workers=min(workers, len(cat_urls))) as pool:
                    per_cat = pool.map(crawl_cat, cat_urls)
                for lst in per_cat:
                    for u in lst:
                        if u not in seen:
                            seen.add(u)
                            all_urls.append(u)
            else:
                for cat in cat_urls:
                    remaining = (limit - len(all_urls)) if limit else 0
                    for u in collect_product_urls(
                        fetcher, cat, follow_pagination=follow_pagination,
                        max_pages=max_pages, log=log, link_pattern=link_pattern,
                        limit=remaining,
                    ):
                        if u not in seen:
                            seen.add(u)
                            all_urls.append(u)
                    if limit and len(all_urls) >= limit:
                        break
            log(f"  total unique products across categories: {len(all_urls)}")
            if all_urls:
                return all_urls[:limit] if limit else all_urls

    # 3) Fall back to a known product-archive path.
    for path in _ARCHIVE_CANDIDATES:
        seed = origin + path
        html = fetcher.get(seed)
        if html and extract.find_product_links(html, seed, link_pattern):
            log(f"  product archive: {seed}")
            return collect_product_urls(
                fetcher, seed, follow_pagination=follow_pagination,
                max_pages=max_pages, log=log, link_pattern=link_pattern,
            )

    # 4) Last resort: crawl the homepage itself.
    log("  no archive found; crawling the homepage for links")
    return collect_product_urls(
        fetcher, origin + "/", follow_pagination=follow_pagination,
        max_pages=max_pages, log=log, link_pattern=link_pattern,
    )


def collect_product_urls(
    fetcher: Fetcher,
    start_url: str,
    follow_pagination: bool = True,
    max_pages: int = 50,
    log: Log = print,
    link_pattern: str | None = None,
    limit: int = 0,
) -> list[str]:
    """Find product links on a listing page, following 'Next' through all pages.

    `limit` > 0 stops early once that many links are collected.
    """
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

        if limit and len(links) >= limit:
            return links[:limit]
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
