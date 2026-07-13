"""Extraction strategies, from most to least reliable:

1. JSON-LD (schema.org/Product) -- structured, present on most modern stores.
2. Open Graph / meta tags        -- title, image, price fallbacks.
3. Custom CSS selectors          -- per-site config for everything else.

Results are merged so each field is filled by the first strategy that has it.
"""

from __future__ import annotations

import json
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .models import Product


def parse(html: str, url: str, selectors: dict | None = None) -> Product:
    """Run every strategy and merge into one Product."""
    soup = BeautifulSoup(html, "lxml")
    product = Product(url=url)

    for strategy in (
        _from_jsonld,
        _from_opengraph,
        lambda s, u: _from_selectors(s, u, selectors),
    ):
        try:
            found = strategy(soup, url)
        except Exception as exc:  # one bad strategy shouldn't kill the rest
            print(f"  [extract warn] {strategy}: {exc}")
            found = None
        if found:
            product.merge(found)

    # The "Description" tab usually carries far richer copy than the JSON-LD/OG
    # blurb (headings, feature lists, a specs table). Prefer it when present, and
    # split the specifications table out into its own structured field.
    try:
        long_desc, specs = _long_description(soup, url)
        if long_desc:
            product.description = long_desc
        if specs:
            product.specs = specs
    except Exception as exc:
        print(f"  [description warn] {exc}")

    product.images = [urljoin(url, i) for i in product.images if i]

    # Galleries often lazy-load extra images (data-* attrs, <a> links) that the
    # structured data omits. Collect those, anchored to the primary image so we
    # don't pull in logos/banners, and dedupe size-variants to the largest copy.
    try:
        gallery = _gallery_images(soup, url, product.images)
        if gallery:
            product.images = _dedupe_images([*product.images, *gallery])
    except Exception as exc:
        print(f"  [gallery warn] {exc}")

    # Drop non-product images: site logos and "no image" placeholders. A product
    # with no real photo should end up with no image, not the shop's logo.
    product.images = _filter_product_images(soup, url, product.images)

    product.name = _strip_site_name(product.name, url)

    # Category hierarchy from the page breadcrumb (parent → leaf), e.g.
    # ["Networking", "Switches"]. Drives the 2-level category tree on ingest.
    try:
        product.category_path = _category_path(soup, url, product.name)
    except Exception as exc:
        print(f"  [breadcrumb warn] {exc}")

    return product


# --------------------------------------------------------------------------
# Category breadcrumb → hierarchy path
# --------------------------------------------------------------------------
# Crumbs that are navigation chrome, not real categories.
_CRUMB_SKIP = {
    "home", "shop", "store", "all", "products", "product", "catalog",
    "categories", "category", "all products",
}

# Breadcrumb containers, most-specific platform selectors first.
BREADCRUMB_SELECTORS = [
    "nav.woocommerce-breadcrumb", ".woocommerce-breadcrumb",
    "nav[aria-label='breadcrumb']", "nav[aria-label='Breadcrumb']",
    ".breadcrumbs", "ol.breadcrumb", ".breadcrumb",
    "[class*='breadcrumb']",
]


def _trim_trail(names: list[str], product_name: str | None, url: str) -> list[str]:
    """Drop Home/Shop chrome, the shop's own name, and the product's own name
    (the last crumb), then keep the top two levels (department → subcategory).

    We keep the FIRST two real crumbs (not the deepest) so every product in a
    department lands under the same 2-level pair consistently — e.g. both
    "Computers & Gear > Laptops > Macbook Air" and "Computers & Gear > Laptops"
    collapse to ["Computers & Gear", "Laptops"]. Deeper site levels are folded
    into the subcategory."""
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    label = host.split(".")[0] if host else ""
    pname = (product_name or "").strip().lower()
    out: list[str] = []
    for raw in names:
        n = (raw or "").strip()
        low = n.lower()
        if not n or low in _CRUMB_SKIP:
            continue
        if label and low == label:
            continue
        if pname and low == pname:
            continue  # the trailing crumb is usually the product itself
        out.append(n)
    # De-dupe adjacent repeats, then keep the top two levels.
    deduped: list[str] = []
    for n in out:
        if not deduped or deduped[-1].lower() != n.lower():
            deduped.append(n)
    return deduped[:2]


def _category_path(soup: BeautifulSoup, url: str, product_name: str | None) -> list[str]:
    """Ordered category trail for a product. Prefers a JSON-LD BreadcrumbList
    (structured/reliable), then a breadcrumb nav in the HTML."""
    # 1) JSON-LD BreadcrumbList
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text() or ""
        for node in _iter_jsonld_nodes(raw):
            t = node.get("@type", "")
            types = t if isinstance(t, list) else [t]
            if not any(str(x).lower() == "breadcrumblist" for x in types):
                continue
            names = []
            for it in node.get("itemListElement") or []:
                if not isinstance(it, dict):
                    continue
                name = it.get("name")
                if not name and isinstance(it.get("item"), dict):
                    name = it["item"].get("name")
                if name:
                    names.append(_clean(str(name)))
            trail = _trim_trail(names, product_name, url)
            if trail:
                return trail

    # 2) HTML breadcrumb nav — take link text plus the trailing current crumb.
    for sel in BREADCRUMB_SELECTORS:
        el = soup.select_one(sel)
        if not el:
            continue
        names = [a.get_text(strip=True) for a in el.find_all("a")]
        # The last crumb (current page) is often plain text, not a link — the
        # separator text between links pollutes get_text, so read links only and
        # let product-name trimming handle the tail.
        trail = _trim_trail(names, product_name, url)
        if trail:
            return trail
    return []


def _strip_site_name(name: str, url: str) -> str:
    """Shops often append their own name to product titles / og:title
    (e.g. "MSI Katana ... Black Pacmax.me"). Drop a trailing occurrence of the
    page's hostname, or of its bare label when a real separator precedes it."""
    if not name:
        return name
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    if not host:
        return name
    cleaned = re.sub(rf"[\s\-–—|,:]*{re.escape(host)}\s*$", "", name, flags=re.IGNORECASE)
    label = host.split(".")[0]
    if len(label) >= 3:
        cleaned = re.sub(
            rf"\s*[\-–—|,:]+\s*{re.escape(label)}\s*$", "", cleaned, flags=re.IGNORECASE
        )
    return cleaned.strip(" \t,-–—|:") or name


# --------------------------------------------------------------------------
# Strategy 1: JSON-LD
# --------------------------------------------------------------------------
def _from_jsonld(soup: BeautifulSoup, url: str) -> Product | None:
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text()
        if not raw:
            continue
        for node in _iter_jsonld_nodes(raw):
            if _is_product_node(node):
                return _product_from_jsonld(node)
    return None


def _iter_jsonld_nodes(raw: str):
    """Yield every dict in a JSON-LD blob, unwrapping @graph and lists."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Some sites emit slightly broken JSON; try to salvage trailing commas.
        try:
            data = json.loads(re.sub(r",\s*([}\]])", r"\1", raw))
        except json.JSONDecodeError:
            return
    stack = [data]
    while stack:
        item = stack.pop()
        if isinstance(item, list):
            stack.extend(item)
        elif isinstance(item, dict):
            yield item
            if "@graph" in item:
                stack.append(item["@graph"])


def _is_product_node(node: dict) -> bool:
    t = node.get("@type", "")
    types = t if isinstance(t, list) else [t]
    return any(str(x).lower() == "product" for x in types)


def _product_from_jsonld(node: dict) -> Product:
    p = Product()
    p.name = _clean(node.get("name"))
    p.description = _clean(node.get("description"))
    p.sku = _clean(node.get("sku") or node.get("mpn") or node.get("gtin13"))
    p.brand = _brand(node.get("brand"))
    p.images = _as_list(node.get("image"))
    p.categories = _as_list(node.get("category"))

    offer = _first_offer(node.get("offers"))
    if offer:
        p.price = _to_float(offer.get("price") or offer.get("lowPrice"))
        p.currency = _clean(offer.get("priceCurrency"))
        avail = offer.get("availability")
        if avail:
            p.availability = str(avail).rsplit("/", 1)[-1]

    rating = node.get("aggregateRating")
    if isinstance(rating, dict):
        p.rating = _to_float(rating.get("ratingValue"))
        p.review_count = _to_int(rating.get("reviewCount") or rating.get("ratingCount"))
    return p


def _first_offer(offers):
    if isinstance(offers, list):
        return offers[0] if offers else None
    if isinstance(offers, dict):
        # AggregateOffer wraps individual offers.
        if "offers" in offers:
            return _first_offer(offers["offers"]) or offers
        return offers
    return None


def _brand(brand):
    if isinstance(brand, dict):
        return _clean(brand.get("name"))
    return _clean(brand)


# --------------------------------------------------------------------------
# Strategy 2: Open Graph / meta tags
# --------------------------------------------------------------------------
def _from_opengraph(soup: BeautifulSoup, url: str) -> Product | None:
    def meta(*props):
        for prop in props:
            tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
            if tag and tag.get("content"):
                return tag["content"].strip()
        return None

    p = Product()
    p.name = meta("og:title", "twitter:title")
    p.description = meta("og:description", "description")
    img = meta("og:image", "og:image:secure_url", "twitter:image")
    if img:
        p.images = [img]
    p.price = _to_float(meta("product:price:amount", "og:price:amount"))
    p.currency = meta("product:price:currency", "og:price:currency")
    p.availability = meta("product:availability", "og:availability")
    if not soup.find("title") and not p.name:
        return None
    if not p.name and soup.title:
        p.name = soup.title.get_text(strip=True)
    return p


# --------------------------------------------------------------------------
# Strategy 3: custom CSS selectors
# --------------------------------------------------------------------------
def _from_selectors(soup: BeautifulSoup, url: str, selectors: dict | None) -> Product | None:
    if not selectors:
        return None
    p = Product()
    known = {"name", "brand", "sku", "price", "currency", "availability",
             "rating", "review_count", "description", "categories", "images"}
    for field, rule in selectors.items():
        values = _apply_selector(soup, rule)
        if not values:
            continue
        if field in ("images", "categories"):
            setattr(p, field, values)
        elif field in ("price", "rating"):
            setattr(p, field, _to_float(values[0]))
        elif field == "review_count":
            p.review_count = _to_int(values[0])
        elif field in known:
            setattr(p, field, values[0])
        else:
            p.extra[field] = values if len(values) > 1 else values[0]
    return p


def _apply_selector(soup: BeautifulSoup, rule) -> list[str]:
    """rule is a CSS string, or {selector, attr} dict. Returns text/attr values."""
    if isinstance(rule, str):
        css, attr = rule, None
    else:
        css, attr = rule.get("selector"), rule.get("attr")
    if not css:
        return []
    out = []
    for el in soup.select(css):
        if attr:
            val = el.get(attr)
        else:
            val = el.get_text(strip=True)
        if val:
            out.append(val.strip())
    return out


# --------------------------------------------------------------------------
# Gallery images (lazy-loaded extras the structured data misses)
# --------------------------------------------------------------------------
# Most-specific first: we use the FIRST selector that matches, so a precise
# platform gallery wins over a greedy fallback (which could match a related-
# products carousel).
GALLERY_CONTAINERS = [
    ".woocommerce-product-gallery",
    ".productView-images", "[class*='productView-image']",
    ".product-single__photos", ".product__media-list",  # Shopify
    "[data-image-gallery]", "#productGallery", ".fotorama",
    ".product-image-gallery", ".product-gallery",
    "[class*='product-gallery']",  # greedy fallback
]
# Where lazy-loaders stash the real (full-size) URL, best first.
IMG_URL_ATTRS = [
    "data-large_image", "data-zoom-image", "data-image-gallery-zoom-image-url",
    "data-image-gallery-new-image-url", "data-image", "data-lazy", "data-src",
    "data-original", "data-flickity-lazyload", "src",
]
_IMG_RX = re.compile(r"\.(jpg|jpeg|png|webp|avif|gif)(\?|$)", re.I)


def _gallery_images(soup: BeautifulSoup, url: str, primary: list[str]) -> list[str]:
    """Collect product gallery image URLs.

    If a recognised gallery container exists we read only inside it (precise).
    Otherwise we scan the page but keep only images that share a deep path
    prefix with the primary image, which filters out logos, banners and icons.
    """
    containers = []
    for sel in GALLERY_CONTAINERS:
        containers = soup.select(sel)
        if containers:
            break

    scope = containers or [soup]
    cands: list[str] = []
    for root in scope:
        for a in root.find_all("a", href=True):
            if _IMG_RX.search(a["href"]):
                cands.append(a["href"])
        for img in root.find_all("img"):
            for attr in IMG_URL_ATTRS:
                val = img.get(attr)
                if val and _IMG_RX.search(val):
                    cands.append(val)
                    break
            for ss_attr in ("srcset", "data-srcset"):
                if img.get(ss_attr):
                    cands.extend(_srcset_urls(img[ss_attr]))

    cands = [urljoin(url, c) for c in cands]
    if not containers and primary:
        cands = [c for c in cands if _shares_image_path(c, primary[0])]
    return _dedupe_images(cands)


def _srcset_urls(srcset: str) -> list[str]:
    out = []
    for part in srcset.split(","):
        u = part.strip().split(" ")[0]
        if u and _IMG_RX.search(u):
            out.append(u)
    return out


# Filenames that are never a product photo (placeholders, logos, UI chrome).
_JUNK_IMG_RX = re.compile(
    r"placeholder|woocommerce-placeholder|/logo[-_.]|[-_]logo\.|favicon|"
    r"sprite|spacer|blank\.(gif|png)|loading\.(gif|svg)|/icons?/",
    re.I,
)
# Common selectors for a site's own logo (e.g. WordPress uses img.custom-logo).
_LOGO_SELECTORS = (
    "img.custom-logo, .logo img, .site-logo img, #logo img, .site-branding img, "
    "a.navbar-brand img, header img.logo, .header-logo img"
)


def _site_logo_identities(soup: BeautifulSoup, base_url: str) -> set[str]:
    """Identities of the site's logo/icon images, so we can exclude them.

    Logos hide in three places: <img> branding elements, <link rel=icon>, and
    the JSON-LD graph (WordPress/Yoast reference the site logo as the page's
    publisher/organization logo, even when it's only a CSS background visually).
    """
    ids: set[str] = set()
    for img in soup.select(_LOGO_SELECTORS):
        for attr in ("src", "data-src", "data-lazy", "srcset"):
            val = img.get(attr)
            if val:
                ids.add(_image_identity(urljoin(base_url, val.split(",")[0].split(" ")[0])))
    for link in soup.select("link[rel*='icon']"):
        if link.get("href"):
            ids.add(_image_identity(urljoin(base_url, link["href"])))

    # JSON-LD: collect 'logo' values and Organization images.
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text()
        if not raw or "logo" not in raw.lower():
            continue
        for node in _iter_jsonld_nodes(raw):
            t = node.get("@type", "")
            types = t if isinstance(t, list) else [t]
            is_org = any("organization" in str(x).lower() for x in types)
            sources = [node.get("logo")]
            if is_org:
                sources.append(node.get("image"))
            pub = node.get("publisher")
            if isinstance(pub, dict):
                sources.append(pub.get("logo"))
            for src in sources:
                for u in _jsonld_image_urls(src):
                    ids.add(_image_identity(urljoin(base_url, u)))
    return ids


def _jsonld_image_urls(val) -> list[str]:
    """Pull image URLs from a JSON-LD value, resolving url/contentUrl/@id refs."""
    if not val:
        return []
    if isinstance(val, str):
        return [val]
    if isinstance(val, dict):
        u = val.get("url") or val.get("contentUrl") or val.get("@id")
        return [u] if u else []
    if isinstance(val, list):
        out: list[str] = []
        for v in val:
            out.extend(_jsonld_image_urls(v))
        return out
    return []


def _filter_product_images(soup: BeautifulSoup, base_url: str, images: list[str]) -> list[str]:
    logos = _site_logo_identities(soup, base_url)
    out = []
    for u in images:
        if _JUNK_IMG_RX.search(u):
            continue
        if _image_identity(u) in logos:
            continue
        out.append(u)
    return out


def _strip_size(url: str) -> str:
    """Remove size tokens (e.g. /1280x1280/, /640w/) and the query string so the
    same image at different sizes collapses to one identity."""
    path = url.split("?")[0]
    path = re.sub(r"/\d+x\d+/", "/", path)        # /600x600/ path segment
    path = re.sub(r"/\d+w/", "/", path)           # /640w/ path segment
    path = re.sub(r"-\d+x\d+(\.[A-Za-z]+)$", r"\1", path)  # -600x600.jpg suffix
    return path


def _img_size(url: str) -> int:
    m = re.search(r"/(\d+)(?:x\d+|w)/", url)
    return int(m.group(1)) if m else 0


def _dir_segments(url: str) -> list[str]:
    """Directory path segments (excludes the filename), on a size-stripped URL."""
    path = urlparse(_strip_size(url)).path
    return [s for s in path.split("/")[:-1] if s]


def _shares_image_path(candidate: str, primary: str) -> bool:
    """True if candidate lives in (nearly) the same directory tree as primary —
    i.e. it's another image of the same product, not a logo/banner."""
    cand, prim = _dir_segments(candidate), _dir_segments(primary)
    if not prim:
        return True
    common = 0
    for a, b in zip(cand, prim):
        if a != b:
            break
        common += 1
    return common >= max(2, len(prim) - 2)


def _image_identity(url: str) -> str:
    """A stable identity for an image, so the same picture at different sizes or
    via different URL forms collapses to one entry.

    Uses the filename stem when it's distinctive (e.g. a slug/hash), since a CDN
    often serves one image under several path shapes; falls back to the
    size-stripped path for short/numeric filenames (e.g. ``1.jpg``)."""
    path = urlparse(url.split("?")[0]).path
    stem = path.rsplit("/", 1)[-1].split(".")[0]
    stem = re.sub(r"-\d+x\d+$", "", stem)  # drop trailing -600x600 size suffix
    if len(stem) >= 8 and re.search(r"[A-Za-z]", stem):
        return stem
    return _strip_size(path)


def _dedupe_images(urls: list[str]) -> list[str]:
    """Keep one URL per distinct image (largest size), preserving first-seen order."""
    best: dict[str, str] = {}
    order: list[str] = []
    for u in urls:
        if not u:
            continue
        key = _image_identity(u)
        if key not in best:
            order.append(key)
            best[key] = u
        elif _img_size(u) > _img_size(best[key]):
            best[key] = u
    return [best[k] for k in order]


# --------------------------------------------------------------------------
# Long-form description + specifications table (the product "Description" tab)
# --------------------------------------------------------------------------
# Where the full product write-up lives, most-specific (WooCommerce) first.
DESCRIPTION_CONTAINERS = [
    "#tab-description",
    ".woocommerce-Tabs-panel--description",
    "[id^='tab-description']",
    "#description.woocommerce-Tabs-panel",
    ".product-description", "#product-description",
    ".product__description", ".product-single__description",
    "[id*='product-description']",
]
# A heading that introduces the spec table — dropped from the prose so the table
# only shows in its own tab.
_SPEC_HEADING_RX = re.compile(
    r"^(technical\s+|tech\s+)?(specifications?|specs?)(\s+table)?:?$", re.I,
)
# Tag -> markdown heading prefix, so the storefront can render structure.
_HEADING_LEVEL = {"h1": "##", "h2": "##", "h3": "###", "h4": "####", "h5": "####", "h6": "####"}


def _long_description(soup: BeautifulSoup, url: str):
    """Return (markdown_text, specs) extracted from a product description tab.

    The description is light markdown (## headings, - bullets, blank-line-
    separated paragraphs). `specs` is a list of [label, value] rows lifted out of
    the spec table(s); those tables (and their "Specifications" heading) are
    removed from the prose so they render only in their own tab.
    """
    container = None
    for sel in DESCRIPTION_CONTAINERS:
        container = soup.select_one(sel)
        if container:
            break
    if container is None:
        return None, []

    # Pull every 2-column table out as structured specs.
    specs: list[list[str]] = []
    for table in container.find_all("table"):
        rows = _table_specs(table)
        if rows:
            specs.extend(rows)
        table.decompose()  # removed either way so a stray table isn't dumped as text

    md = _blocks_to_markdown(container)
    return (md or None), specs


def _table_specs(table) -> list[list[str]]:
    """[label, value] rows from a 2-column table (extra columns joined into value).

    A header row (all-<th>, or inside <thead>, e.g. "Feature | Details") is
    skipped — it labels the columns, it isn't a spec."""
    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        tcells = tr.find_all(["td", "th"])
        cells = [c.get_text(" ", strip=True) for c in tcells]
        cells = [c for c in cells if c]
        if len(cells) < 2:
            continue
        is_header = tr.find_parent("thead") is not None or all(c.name == "th" for c in tcells)
        if is_header:
            continue
        rows.append([_tidy(cells[0]), _tidy(" ".join(cells[1:]))])
    return rows


def _blocks_to_markdown(container) -> str:
    """Flatten a description container to light markdown, preserving headings and
    lists. List/heading content nested inside another list item is skipped so it
    isn't emitted twice."""
    blocks: list[str] = []
    for el in container.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol"]):
        # Skip anything living inside a list item — its parent <ul>/<ol> emits it.
        if el.find_parent("li") is not None:
            continue
        if el.name in _HEADING_LEVEL:
            text = _tidy(el.get_text(" ", strip=True))
            if not text or _SPEC_HEADING_RX.match(text):
                continue
            blocks.append(f"{_HEADING_LEVEL[el.name]} {text}")
        elif el.name in ("ul", "ol"):
            items = []
            for li in el.find_all("li", recursive=False):
                t = _tidy(li.get_text(" ", strip=True))
                if t:
                    items.append(f"- {t}")
            if items:
                blocks.append("\n".join(items))
        else:  # p
            text = _tidy(el.get_text(" ", strip=True))
            if text:
                blocks.append(text)
    return "\n\n".join(blocks)


def _tidy(text: str) -> str:
    """Collapse whitespace and fix the stray spaces left when inline tags (bold,
    links) are unwrapped, e.g. '1TB SSD ,' -> '1TB SSD,'."""
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text


# --------------------------------------------------------------------------
# Link discovery (for --crawl)
# --------------------------------------------------------------------------
# Action/utility links that show up inside product cards but aren't products.
_NON_PRODUCT_LINK_RX = re.compile(
    r"add[-_]to[-_]cart|add_to_wishlist|[?&](orderby|paged|add-to-cart|yith\w*)=|"
    r"/(cart|checkout|my-account|wishlist|compare|login|register)(/|$|\?)",
    re.I,
)


def find_product_links(html: str, base_url: str, pattern: str | None) -> list[str]:
    """Return absolute links on a listing/category page that look like products.

    If a regex `pattern` is given it's authoritative. Otherwise we use two
    heuristics that cover most stores: anchors inside product containers
    (e.g. WooCommerce `li.product`, Shopify product cards), plus common
    product URL patterns.
    """
    soup = BeautifulSoup(html, "lxml")
    links: list[str] = []

    def add(href: str):
        # Keep the query string: some stores use query-based product permalinks
        # (e.g. WooCommerce "?product=slug"); stripping it would collapse every
        # product to the homepage. Only the fragment is dropped.
        full = urljoin(base_url, href.split("#")[0])
        if (full not in links and full.startswith("http")
                and not _NON_PRODUCT_LINK_RX.search(full)):
            links.append(full)

    if pattern:
        rx = re.compile(pattern)
        for a in soup.find_all("a", href=True):
            if rx.search(urljoin(base_url, a["href"])):
                add(a["href"])
        return links

    # Heuristic 1: links inside elements whose class hints "product".
    container_sel = (
        "li.product a[href], .product a[href], .product-card a[href], "
        "[class*='product-item'] a[href], a.woocommerce-LoopProduct-link[href], "
        "a[class*='product-link'][href]"
    )
    seen_containers = set()
    for a in soup.select(container_sel):
        # One link per immediate product container to avoid dupes.
        parent_id = id(a.find_parent(class_=re.compile("product")))
        if parent_id in seen_containers:
            continue
        seen_containers.add(parent_id)
        add(a["href"])

    # Heuristic 2: common product URL shapes.
    if not links:
        rx = re.compile(r"/(product|products|item|p|dp|shop)/[^/]+/?$", re.I)
        for a in soup.find_all("a", href=True):
            if rx.search(urljoin(base_url, a["href"])):
                add(a["href"])

    return links


_NEXT_TEXT_RX = re.compile(r"^(next|older|more|›|»|→|>)\s*$", re.I)


def find_next_page(html: str, current_url: str) -> str | None:
    """Return the URL of the next results page, or None if this is the last one."""
    soup = BeautifulSoup(html, "lxml")

    # 1. The canonical signal: <link rel="next"> or <a rel="next">.
    for tag in soup.find_all(rel="next"):
        href = tag.get("href")
        if href:
            nxt = urljoin(current_url, href)
            return nxt if nxt != current_url else None

    # 2. A pagination link labelled "Next" (text or aria-label).
    candidates = soup.select(
        "a[aria-label*='Next' i], a.next, a.pagination-next, "
        ".pagination a, [class*='pagination'] a, nav a"
    )
    for a in candidates:
        href = a.get("href")
        if not href:
            continue
        label = (a.get("aria-label") or a.get_text() or "").strip()
        if _NEXT_TEXT_RX.match(label) or "next" in label.lower():
            nxt = urljoin(current_url, href)
            if nxt != current_url:
                return nxt
    return None


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------
def _as_list(val) -> list[str]:
    if val is None:
        return []
    if isinstance(val, str):
        return [val]
    if isinstance(val, dict):
        return [val.get("url") or val.get("name") or ""]
    if isinstance(val, list):
        out = []
        for v in val:
            out.extend(_as_list(v))
        return [x for x in out if x]
    return [str(val)]


def _clean(val):
    if val is None:
        return None
    text = BeautifulSoup(str(val), "lxml").get_text(" ", strip=True)
    return text or None


def _to_float(val):
    if val is None:
        return None
    m = re.search(r"-?\d[\d,]*\.?\d*", str(val).replace(",", ""))
    return float(m.group()) if m else None


def _to_int(val):
    f = _to_float(val)
    return int(f) if f is not None else None
