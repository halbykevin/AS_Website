"""ticketingboxoffice.com.

Its homepage carries every current event/group as isotope-filtered cards, each
tagged with its category CSS class — so one page gives us both the full list AND
the event->category mapping. We then visit each event/group page for details.

Two URL shapes:
  /<slug>-tickets/event/<id>/en   a single show (one date)
  /<slug>-tickets/group/<id>/en   one event over many nights — its page lists
                                  each sub-show (title/date/time/venue/link)

A group becomes ONE event with several `dates` entries (each keeping its own
booking link), so a play's run or a tournament is captured whole.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from . import categories as cats
from .common import clean, parse_date, parse_time

KEY = "ticketingboxoffice"
LABEL = "Ticketing Box Office"
BASE = "https://www.ticketingboxoffice.com"


def _og(soup, prop: str) -> str:
    m = soup.find("meta", attrs={"property": f"og:{prop}"})
    return clean(m.get("content") or "") if m else ""


def _collect(f):
    """Return (category tiles, {detail_url: source category label})."""
    html = f.get(BASE + "/")
    if not html:
        return [], {}
    soup = BeautifulSoup(html, "lxml")

    tiles, filters = [], {}
    for div in soup.select("div.catStyle"):
        df = (div.get("data-filter") or "").lstrip(".")
        title_el = div.select_one(".EvCatTitle")
        name = title_el.get_text(strip=True) if title_el else ""
        if not df or df.lower() == "all" or not name:
            continue
        bg = div.select_one("[style*=background-image]")
        image = ""
        if bg:
            mm = re.search(r"url\(['\"]?([^'\")]+)", bg.get("style", ""))
            image = mm.group(1) if mm else ""
        filters[df] = name
        tiles.append(cats.entry(cats.canonical(name), image))

    # An event appears more than once (featured carousel + grid card); only the
    # grid card carries the category class, so keep scanning until one has it.
    url_cat: dict[str, str] = {}
    for a in soup.select('a[href*="/event/"], a[href*="/group/"]'):
        href = a.get("href") or ""
        if "/event/" not in href and "/group/" not in href:
            continue
        full = urljoin(BASE, href.split("?")[0])
        if url_cat.get(full):
            continue
        node, cat = a, ""
        for _ in range(6):
            if node is None:
                break
            hit = set(node.get("class", []) or []) & set(filters)
            if hit:
                cat = filters[sorted(hit)[0]]
                break
            node = node.parent
        if full not in url_cat or cat:
            url_cat[full] = cat

    return tiles, url_cat


def _venue_city(soup) -> tuple[str, str]:
    loc = soup.select_one(".LocationEvnt")
    if not loc:
        return "", ""
    parts = [clean(p.get_text(" ", strip=True)) for p in loc.select(".floatL")]
    parts = [p for p in parts if p and p not in ("-", "Venue:", "Get Directions")]
    if not parts:
        return "", ""
    place = next((p for p in parts[1:] if "," in p), "")
    return parts[0], (place.split(",")[0].strip() if place else "")


def _scrape_event(f, url: str, label: str) -> dict | None:
    html = f.get(url)
    if not html:
        return None
    soup = BeautifulSoup(html, "lxml")
    de = soup.select_one(".DateEvnt")
    date_text = de.get_text(" ", strip=True) if de else ""
    d = parse_date(date_text)
    if not d:
        return None
    venue, city = _venue_city(soup)
    mid = re.search(r"/event/(\d+)/", url)
    return {
        "source": KEY,
        "externalId": f"event-{mid.group(1)}" if mid else url,
        "title": _og(soup, "title") or clean(soup.title.get_text() if soup.title else ""),
        "description": _og(soup, "description"),
        "imageUrl": _og(soup, "image"),
        "ticketUrl": url,
        "venue": venue,
        "city": city,
        "country": "Lebanon",
        "categoryName": cats.canonical(label),
        "dates": [{"date": d, "time": parse_time(date_text), "label": "", "venue": venue, "url": url}],
    }


def _scrape_group(f, url: str, label: str) -> tuple[dict | None, list[str]]:
    html = f.get(url)
    if not html:
        return None, []
    soup = BeautifulSoup(html, "lxml")

    dates, sub_ids, venues = [], [], []
    for mix in soup.select("div.mix"):
        a = mix.select_one('a[href*="/event/"]')
        if not a:
            continue
        sub_url = urljoin(BASE, (a.get("href") or "").split("?")[0])
        mid = re.search(r"/event/(\d+)/", sub_url)
        if mid:
            sub_ids.append(mid.group(1))
        txt = mix.get_text(" ", strip=True)
        d = parse_date(txt)
        if not d:
            continue
        show = re.split(r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}", txt)[0].strip()
        mv = re.search(r"\|\s*\d{1,2}:\d{2}\s*[AaPp][Mm]\s+(.*?)\s+BUY TICKETS", txt, re.I)
        venue = clean(mv.group(1)) if mv else ""
        if venue:
            venues.append(venue)
        dates.append({"date": d, "time": parse_time(txt), "label": show, "venue": venue, "url": sub_url})

    if not dates:
        return None, sub_ids
    venue = max(set(venues), key=venues.count) if venues else ""
    gid = re.search(r"/group/(\d+)/", url)
    return {
        "source": KEY,
        "externalId": f"group-{gid.group(1)}" if gid else url,
        "title": _og(soup, "title") or clean(soup.title.get_text() if soup.title else ""),
        "description": _og(soup, "description"),
        "imageUrl": _og(soup, "image"),
        "ticketUrl": url,
        "venue": venue,
        "city": "",
        "country": "Lebanon",
        "categoryName": cats.canonical(label),
        "dates": dates,
    }, sub_ids


def fetch(f, limit: int = 0, **_) -> tuple[list[dict], list[dict]]:
    tiles, url_cat = _collect(f)
    if not url_cat:
        raise RuntimeError("ticketingboxoffice.com homepage returned no events")
    print(f"  homepage: {len(tiles)} categories, {len(url_cat)} events/groups")

    groups = [u for u in url_cat if "/group/" in u]
    singles = [u for u in url_cat if "/event/" in u]

    events: list[dict] = []
    sub_ids: set[str] = set()

    for i, url in enumerate(groups, 1):
        rec, subs = _scrape_group(f, url, url_cat.get(url, ""))
        sub_ids.update(subs)
        if not rec:
            print(f"  [group {i}/{len(groups)}] skipped (no dates) {url}")
            continue
        events.append(rec)
        print(f"  [group {i}/{len(groups)}] {rec['title']} — {len(rec['dates'])} date(s)")

    # A standalone event that is really one night of a group we already have.
    singles = [u for u in singles
               if (re.search(r"/event/(\d+)/", u) or [None, ""])[1] not in sub_ids]
    if limit:
        singles = singles[:limit]

    for i, url in enumerate(singles, 1):
        rec = _scrape_event(f, url, url_cat.get(url, ""))
        if not rec:
            print(f"  [event {i}/{len(singles)}] skipped (no date) {url}")
            continue
        events.append(rec)
        print(f"  [event {i}/{len(singles)}] {rec['title']} — {rec['dates'][0]['date']}")

    return tiles, events
