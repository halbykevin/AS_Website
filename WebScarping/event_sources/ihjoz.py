"""ihjoz.com.

Server-rendered Rails-ish pages, so plain HTML parsing. `/events/browse` pages
through every listing ten at a time and each card already carries its event-type
tag — so the listing gives us the category and we only visit the detail page for
the date, venue and description.

`browse[selected_countries]` scopes the crawl (Lebanon = 121); the free-text
keyword tags on a detail page are ignored — only the event-type tag becomes a
category, or the keywords would each spawn a tile.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from . import categories as cats
from .common import clean, excerpt, parse_date, parse_time, strip_html

KEY = "ihjoz"
LABEL = "ihjoz"
BASE = "https://ihjoz.com"

# ihjoz's own country ids, from the /events/browse filter.
COUNTRY_IDS = {"lebanon": "121"}

MAX_PAGES = 40  # a hard stop so a paging quirk can never loop for ever


def _og(soup, prop: str) -> str:
    m = soup.find("meta", attrs={"property": f"og:{prop}"})
    return clean(m.get("content") or "") if m else ""


def _browse(f, country: str) -> dict[str, str]:
    """Walk /events/browse and return {event id: event-type label}."""
    found: dict[str, str] = {}
    cid = COUNTRY_IDS.get((country or "").lower(), "")
    for page in range(1, MAX_PAGES + 1):
        params = {"page": page}
        if cid:
            params["browse[selected_countries]"] = cid
        html = f.get(BASE + "/events/browse", params=params)
        if not html:
            break
        soup = BeautifulSoup(html, "lxml")
        new = 0
        for card in soup.select("div.event-card"):
            a = card.select_one('a[href*="/events/"]')
            if not a:
                continue
            m = re.search(r"/events/(\d+)", a.get("href") or "")
            if not m:
                continue
            tag = card.select_one('a[href*="browse%5Bevent_type%5D"]')
            label = tag.get_text(strip=True) if tag else ""
            if m.group(1) not in found:
                new += 1
            # A later page never has a better label than the first one we saw.
            found.setdefault(m.group(1), label)
        print(f"  browse page {page}: {new} new")
        if not new:
            break
    return found


def _event(f, eid: str, label: str, country: str) -> dict | None:
    url = f"{BASE}/events/{eid}"
    html = f.get(url)
    if not html:
        return None
    soup = BeautifulSoup(html, "lxml")

    card = soup.select_one("div.overview-event-info") or soup
    root = card.parent if card is not soup else soup

    title_el = root.select_one(".event-card-title-text")
    title = clean(title_el.get_text(" ", strip=True)) if title_el else _og(soup, "title")
    title = re.sub(r"\s*-\s*ihjoz$", "", title)

    date_el = root.select_one(".event-card-info-date .event-date")
    date_text = clean(date_el.get_text(" ", strip=True)) if date_el else ""
    date = parse_date(date_text)
    if not date:
        # A recurring listing ("Swimming Session") has no single date — it is a
        # standing activity, not an event with a night, so we leave it out.
        return None

    loc_el = root.select_one(".event-card-info-location")
    venue_parts = [clean(s.get_text(" ", strip=True)) for s in loc_el.select("span")] if loc_el else []
    venue_parts = [p.rstrip(",") for p in venue_parts if p]
    venue = venue_parts[0] if venue_parts else ""
    city = venue_parts[1] if len(venue_parts) > 1 else ""

    desc_el = root.select_one("#event-description")
    body = strip_html(desc_el.decode_contents()) if desc_el else _og(soup, "description")

    image = ""
    img = root.select_one("img.card-img-top")
    if img:
        image = urljoin(BASE, img.get("src") or "")
    image = image or _og(soup, "image")

    return {
        "source": KEY,
        "externalId": str(eid),
        "title": title,
        "description": body,
        "excerpt": excerpt(body),
        "imageUrl": image,
        "ticketUrl": url,
        "venue": venue,
        "city": city,
        "country": country or "",
        "categoryName": cats.canonical(label),
        "dates": [{"date": date, "time": parse_time(date_text), "label": "", "venue": venue, "url": url}],
    }


def fetch(f, limit: int = 0, country: str = "Lebanon", **_) -> tuple[list[dict], list[dict]]:
    listed = _browse(f, country)
    if not listed:
        raise RuntimeError("ihjoz.com listed no events")
    print(f"  browse: {len(listed)} listing(s)")

    events = []
    for i, (eid, label) in enumerate(listed.items(), 1):
        rec = _event(f, eid, label, country)
        if not rec:
            print(f"  [{i}/{len(listed)}] skipped (no date) /events/{eid}")
            continue
        events.append(rec)
        print(f"  [{i}/{len(listed)}] {rec['title']} — {rec['dates'][0]['date']} ({rec['categoryName']})")
        if limit and len(events) >= limit:
            break

    tiles = [cats.entry(name) for name in sorted({e["categoryName"] for e in events})]
    return tiles, events
