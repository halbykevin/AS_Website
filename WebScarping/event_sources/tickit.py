"""tickit.co.

Tick'it is a Next.js front end over a JSON API, and the API is what the site
itself calls from the browser — one POST returns every published event for a
country with its venue, coordinates, genres, price range and image. That is far
steadier than parsing React output, so we call it directly and fall back to
nothing if it moves (the run reports the source as failed rather than importing
a half-empty list).

Tick'it lists several countries; `country` keeps the sync to the one AS Company
sells into. Genres come back as `musicTypes` and are folded into our own
categories by categories.py.
"""

from __future__ import annotations

from .common import clean, excerpt, from_epoch, strip_html
from . import categories as cats

KEY = "tickit"
LABEL = "Tick'it"
BASE = "https://tickit.co"

# The public endpoint tickit.co's own browser bundle calls, with the token it
# ships to every visitor. Read-only: it lists what the site already shows.
API = "https://us-central1-ticket-development-6f3af.cloudfunctions.net/"
API_TOKEN = ("ZEdsamEybDBYMkZ3YVE9PTpkR2xqYTJsMFgyRndhVjl3WVhOemQyOXlaRjhr"
             "SkNSZlpHVjJjdz09ZGtsd29zc3h3ZD1hcw==")

_HEADERS = {
    "Authorization": "Basic " + API_TOKEN,
    "Content-Type": "application/json",
    "Origin": BASE,
    "Referer": BASE + "/",
}


def _seconds(ts) -> float | None:
    if isinstance(ts, dict) and "_seconds" in ts:
        return float(ts["_seconds"])
    return None


def _offset(e) -> int:
    tz = e.get("timezoneMap") or {}
    off = tz.get("offset")
    return int(off) if isinstance(off, (int, float)) else 0


def _event(e: dict) -> dict | None:
    eid = e.get("eventID")
    start = _seconds(e.get("startDate"))
    if not eid or not start:
        return None
    if e.get("isHidden") or e.get("isPublished") is False:
        return None
    if (e.get("status") or "scheduled") in ("cancelled", "canceled", "draft"):
        return None

    date, time_ = from_epoch(start, _offset(e))
    url = f"{BASE}/events/{eid}"
    venue = clean(e.get("venueName") or (e.get("orgSnippet") or {}).get("orgName") or "")
    body = strip_html(e.get("description") or "")

    return {
        "source": KEY,
        "externalId": str(eid),
        "title": clean(e.get("name") or ""),
        "description": body,
        "excerpt": excerpt(body),
        "imageUrl": e.get("thumbnailUrl") or e.get("imageUrl") or "",
        "ticketUrl": url,
        "venue": venue,
        "city": clean(e.get("eventCity") or e.get("eventPlace") or ""),
        "country": clean(e.get("eventCountry") or ""),
        "categoryName": cats.pick(e.get("musicTypes") or [], genre=True),
        "dates": [{"date": date, "time": time_, "label": "", "venue": venue, "url": url}],
    }


def fetch(f, limit: int = 0, country: str = "Lebanon", **_) -> tuple[list[dict], list[dict]]:
    body = {"source": "tickit.co"}
    if country:
        body["country"] = country
    payload = f.json(API + "api/events/get-events", method="post",
                     headers=_HEADERS, json=body)
    if not payload or payload.get("code") != 200:
        raise RuntimeError("tickit.co API returned no events")

    data = payload.get("data") or {}
    raw = data.get("data") if isinstance(data, dict) else data
    raw = raw if isinstance(raw, list) else []
    print(f"  api: {len(raw)} listing(s) for {country or 'all countries'}")

    events = []
    for e in raw:
        rec = _event(e)
        if not rec:
            continue
        # The API filters by country, but a mis-tagged listing would still be
        # wrong on our site — so check the event's own country too.
        if country and rec["country"] and rec["country"].lower() != country.lower():
            continue
        events.append(rec)
        if limit and len(events) >= limit:
            break
        print(f"  [{len(events)}] {rec['title']} — {rec['dates'][0]['date']} ({rec['categoryName']})")

    tiles = [cats.entry(name) for name in sorted({e["categoryName"] for e in events})]
    return tiles, events
