"""antoineticketing.com.

A Next.js front end over a JSON API (Tixity) that the site's own browser bundle
calls, with no token — only the `X-Requested-With` header it always sends. So,
like tickit.py, we call the API rather than parse React output.

Antoine models a run the way Ticketing Box Office models a group: a `main`
product is the show, and each night is a `sub` product with its own id, date,
time and booking page (`/events/<sub id>/<slug>`). `showSubs=true` returns the
nights inline and `extended=true` adds the description, so the whole calendar
is `totalPages` requests (the server caps a page at 12) and no detail pages.
A one-night listing comes back as `rep: single`, with no subs and its date on
the product itself.

`type` is Antoine's own vocabulary (music, theater, movies, kids, ...), folded
into ours by categories.py.
"""

from __future__ import annotations

from . import categories as cats
from .common import clean, excerpt, parse_time, strip_html

KEY = "antoineticketing"
LABEL = "Antoine Ticketing"
BASE = "https://www.antoineticketing.com"

API = BASE + "/tixity/api/public/v1/"
_HEADERS = {"X-Requested-With": "xmlhttprequest", "Accept": "application/json"}

MAX_PAGES = 40  # a hard stop so a paging quirk can never loop for ever


def _link(path: str) -> str:
    # The API writes its own links as "https://www.antoineticketing.com//events/…".
    return BASE + "/" + path.lstrip("/")


def _night(s: dict, venue: str, title: str, fallback_url: str) -> dict | None:
    sched = s.get("schedule") or {}
    day = sched.get("date") or sched.get("startDate")
    if not day:
        return None
    url = _link(f"events/{s['id']}/{s.get('slug') or ''}") if s.get("id") else fallback_url
    name = clean(s.get("name") or "")
    return {
        "date": day,
        "time": parse_time(sched.get("time") or ""),
        # A sub only gets a label when it is named differently from its show.
        "label": name if name and name != title else "",
        "venue": clean((s.get("venue") or {}).get("name") or "") or venue,
        "url": url,
    }


def _event(p: dict) -> dict | None:
    pid = p.get("id")
    if not pid:
        return None
    if (p.get("display") or {}).get("active") is False:
        return None

    title = clean(p.get("name") or "")
    v = p.get("venue") or {}
    addr = v.get("address") or {}
    venue = clean(v.get("name") or "")
    url = _link(f"events/{pid}/{p.get('slug') or ''}")

    subs = [s for s in (p.get("subs") or []) if (s.get("display") or {}).get("active") is not False]
    nights = [_night(s, venue, title, url) for s in subs] if subs else [_night(p, venue, title, url)]
    nights = [n for n in nights if n]
    if not nights:
        return None

    body = strip_html(p.get("text") or "")
    media = p.get("media") or {}
    return {
        "source": KEY,
        "externalId": str(pid),
        "title": title,
        "description": body,
        "excerpt": excerpt(body),
        # `image` is the listing card (~16:9); `banner` is a wide page header.
        "imageUrl": media.get("image") or media.get("banner") or "",
        "ticketUrl": url,
        "venue": venue,
        "city": clean(addr.get("city") or ""),
        "country": clean(addr.get("country") or ""),
        "categoryName": cats.canonical(p.get("type") or "", source=KEY),
        "dates": nights,
    }


def fetch(f, limit: int = 0, country: str = "Lebanon", **_) -> tuple[list[dict], list[dict]]:
    raw: dict[str, dict] = {}
    total = None
    for page in range(1, MAX_PAGES + 1):
        payload = f.json(API + "products", headers=_HEADERS, params={
            "model": "event", "date": "upcoming", "showSubs": "true",
            "extended": "true", "pageNumber": page,
        })
        products = (payload or {}).get("products") if isinstance(payload, dict) else None
        if not isinstance(products, dict):
            # A page missing from the middle would read as those events being
            # delisted, so fail the source instead of importing a partial list.
            raise RuntimeError(f"antoineticketing.com API returned no page {page}")
        items = products.get("items") or []
        total = products.get("totalRows", total)
        new = 0
        for p in items:
            if p.get("id") and str(p["id"]) not in raw:
                raw[str(p["id"])] = p
                new += 1
        print(f"  api page {page}/{products.get('totalPages') or '?'}: {new} new")
        if not new or page >= int(products.get("totalPages") or 0):
            break

    if not raw:
        raise RuntimeError("antoineticketing.com listed no events")
    print(f"  api: {len(raw)} listing(s)" + (f" of {total}" if total else ""))

    events = []
    for p in raw.values():
        rec = _event(p)
        if not rec:
            continue
        if country and rec["country"] and rec["country"].lower() != country.lower():
            continue
        events.append(rec)
        n = len(rec["dates"])
        print(f"  [{len(events)}] {rec['title']} — {rec['dates'][0]['date']}"
              f"{f' (+{n - 1} more)' if n > 1 else ''} ({rec['categoryName']})")
        if limit and len(events) >= limit:
            break

    tiles = [cats.entry(name) for name in sorted({e["categoryName"] for e in events})]
    return tiles, events
