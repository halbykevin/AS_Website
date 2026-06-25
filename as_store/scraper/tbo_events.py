#!/usr/bin/env python3
"""Scrape events + categories from ticketingboxoffice.com into a JSON file the
AS Company API ingests into Postgres.

The site's homepage carries every current event/group as isotope-filtered cards,
each tagged with its category CSS class — so the homepage gives us both the full
event list AND the event→category mapping. We then visit each event/group page
for the details.

Two URL shapes:
  /<slug>-tickets/event/<id>/en   a single show (one date)
  /<slug>-tickets/group/<id>/en   one event spanning many shows/days — its page
                                  lists each sub-show (title/date/time/venue/link)

A group becomes ONE event with multiple `dates` entries (each keeping its own
booking link), so multi-day events are captured whole.

Usage:
  python tbo_events.py --out events.json [--delay 0.3] [--limit 0]

Progress is printed to stdout (for the admin log); the structured result is
written to the --out file as {"categories": [...], "events": [...]}.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

BASE = "https://www.ticketingboxoffice.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ASCompanyBot/1.0)"}

_MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], 1)}
for _m, _i in list(_MONTHS.items()):
    _MONTHS[_m[:3]] = _i


def slugify(s: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower().strip()))


def parse_date(text: str) -> str | None:
    """'Friday 19 June 2026 | 07:00 PM' / '15 Jun 2026' -> '2026-06-19'."""
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b", text or "")
    if not m:
        return None
    day, mon, year = int(m.group(1)), _MONTHS.get(m.group(2).capitalize()), int(m.group(3))
    if not mon:
        return None
    return f"{year:04d}-{mon:02d}-{day:02d}"


def parse_time(text: str) -> str:
    m = re.search(r"(\d{1,2}:\d{2})\s*([AaPp][Mm])", text or "")
    return f"{m.group(1)} {m.group(2).upper()}" if m else ""


class Scraper:
    def __init__(self, delay: float = 0.3):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def get(self, url: str) -> str | None:
        try:
            r = self.session.get(url, timeout=30)
            r.raise_for_status()
            time.sleep(self.delay)
            return r.text
        except Exception as exc:  # noqa: BLE001
            print(f"  ! failed {url}: {exc}")
            return None

    # ---------------------------------------------------------------- homepage
    def collect(self) -> tuple[list[dict], dict[str, str]]:
        """Return (categories, {detail_url: category_name}) from the homepage."""
        html = self.get(BASE + "/")
        if not html:
            raise SystemExit("Could not load the homepage.")
        soup = BeautifulSoup(html, "lxml")

        categories, filters = [], {}
        for div in soup.select("div.catStyle"):
            classes = " ".join(div.get("class", []))
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
            categories.append({"name": name, "slug": slugify(name), "image": image})

        # Map each event/group card to its category via the card's CSS classes.
        # An event appears several times (featured carousel + grid card); only the
        # grid card carries the category class, so keep scanning until we find one.
        url_cat: dict[str, str] = {}
        for a in soup.select('a[href*="/event/"], a[href*="/group/"]'):
            href = a.get("href") or ""
            if "/event/" not in href and "/group/" not in href:
                continue
            full = urljoin(BASE, href.split("?")[0])
            if url_cat.get(full):
                continue  # already have a category for this one
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

        print(f"Homepage: {len(categories)} categories, {len(url_cat)} events/groups.")
        return categories, url_cat

    # ----------------------------------------------------------- detail pages
    @staticmethod
    def _og(soup, prop: str) -> str:
        m = soup.find("meta", attrs={"property": f"og:{prop}"})
        return (m.get("content") or "").strip() if m else ""

    def scrape_event(self, url: str) -> dict | None:
        html = self.get(url)
        if not html:
            return None
        soup = BeautifulSoup(html, "lxml")
        title = self._og(soup, "title") or (soup.title.get_text(strip=True) if soup.title else "")
        de = soup.select_one(".DateEvnt")
        date_text = de.get_text(" ", strip=True) if de else ""

        venue, city = "", ""
        loc = soup.select_one(".LocationEvnt")
        if loc:
            parts = [p.get_text(" ", strip=True).replace("\xa0", " ").strip()
                     for p in loc.select(".floatL")]
            parts = [p for p in parts if p and p not in ("-", "Venue:", "Get Directions")]
            if parts:
                venue = parts[0]
                # The locality is the part that looks like "City, Country".
                place = next((p for p in parts[1:] if "," in p), "")
                city = place.split(",")[0].strip() if place else ""

        d = parse_date(date_text)
        dates = [{"date": d, "time": parse_time(date_text), "label": "", "venue": venue, "url": url}] if d else []
        return {
            "type": "event",
            "title": title,
            "description": self._og(soup, "description"),
            "imageUrl": self._og(soup, "image"),
            "ticketUrl": url,
            "venue": venue,
            "city": city,
            "dates": dates,
        }

    def scrape_group(self, url: str) -> dict | None:
        html = self.get(url)
        if not html:
            return None
        soup = BeautifulSoup(html, "lxml")
        title = self._og(soup, "title") or (soup.title.get_text(strip=True) if soup.title else "")

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
            label = re.split(r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}", txt)[0].strip()
            mv = re.search(r"\|\s*\d{1,2}:\d{2}\s*[AaPp][Mm]\s+(.*?)\s+BUY TICKETS", txt, re.I)
            venue = (mv.group(1).strip() if mv else "")
            if venue:
                venues.append(venue)
            dates.append({"date": d, "time": parse_time(txt), "label": label, "venue": venue, "url": sub_url})

        venue = max(set(venues), key=venues.count) if venues else ""
        return {
            "type": "group",
            "title": title,
            "description": self._og(soup, "description"),
            "imageUrl": self._og(soup, "image"),
            "ticketUrl": url,
            "venue": venue,
            "city": "",
            "dates": dates,
            "_subIds": sub_ids,
        }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Scrape Ticketing Box Office events.")
    ap.add_argument("--out", required=True, help="Path to write the result JSON.")
    ap.add_argument("--delay", type=float, default=0.3, help="Seconds between requests.")
    ap.add_argument("--limit", type=int, default=0, help="Max events (0 = all).")
    args = ap.parse_args(argv)

    s = Scraper(delay=args.delay)
    categories, url_cat = s.collect()

    groups = [u for u in url_cat if "/group/" in u]
    singles = [u for u in url_cat if "/event/" in u]

    events: list[dict] = []
    group_sub_ids: set[str] = set()

    print(f"\nScraping {len(groups)} group(s)…")
    for i, url in enumerate(groups, 1):
        rec = s.scrape_group(url)
        if not rec or not rec["dates"]:
            print(f"  [{i}/{len(groups)}] (skipped, no dates) {url}")
            continue
        group_sub_ids.update(rec.pop("_subIds", []))
        mid = re.search(r"/group/(\d+)/", url)
        rec["externalId"] = f"group-{mid.group(1)}" if mid else url
        rec["categoryName"] = url_cat.get(url, "")
        events.append(rec)
        print(f"  [{i}/{len(groups)}] {rec['title']} — {len(rec['dates'])} date(s)")

    # Skip standalone events that are really a group's sub-show.
    singles = [u for u in singles if (re.search(r"/event/(\d+)/", u) or [None, ""])[1] not in group_sub_ids]
    if args.limit:
        singles = singles[: args.limit]

    print(f"\nScraping {len(singles)} single event(s)…")
    for i, url in enumerate(singles, 1):
        rec = s.scrape_event(url)
        if not rec or not rec["dates"]:
            print(f"  [{i}/{len(singles)}] (skipped, no date) {url}")
            continue
        mid = re.search(r"/event/(\d+)/", url)
        rec["externalId"] = f"event-{mid.group(1)}" if mid else url
        rec["categoryName"] = url_cat.get(url, "")
        events.append(rec)
        print(f"  [{i}/{len(singles)}] {rec['title']} — {rec['dates'][0]['date']}")

    # Primary (earliest) date for each event, for sorting/cards.
    for e in events:
        ds = sorted(d["date"] for d in e["dates"] if d.get("date"))
        e["primaryDate"] = ds[0] if ds else None
        first = next((d for d in e["dates"] if d.get("date") == e["primaryDate"]), e["dates"][0])
        e["primaryTime"] = first.get("time", "")

    # Only keep categories actually used (plus they carry images for our tiles).
    out = {"categories": categories, "events": events}
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)

    print(f"\nDone. {len(events)} event(s), {len(categories)} categories → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
