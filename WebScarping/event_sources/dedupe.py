"""Turn three ticketing sites' listings into one clean list of events.

Two different things both look like "duplicates" on the site, and they need
opposite treatment:

**A run** — one show playing many nights. Ticketing Box Office already models
this as a `group`, but Tick'it and ihjoz publish each night as its own listing,
so a ten-night stand-up run arrives as ten identical-looking events. Those are
*merged* into one event carrying ten `dates`, each keeping its own booking link
— the shape the site and the API already understand.

**A cross-listing** — one event sold on two sites at once, which is routine in
Beirut ("SHIMZA at IRIS Beirut - Sep 03" on Tick'it is "SHIMZA Live at Iris
Beirut - Sep 03" on ihjoz). Those are *dropped*, keeping whichever source ranks
highest (see event_sources.SOURCES), and the dropped ids are reported so the
importer can clear a row an earlier run created.

Both decisions rest on `normalize()`, which strips a title down to the words
that identify the act, and on the dates agreeing — requiring an overlapping day
is what stops two unrelated nights with a generic name from being welded
together.
"""

from __future__ import annotations

import re
from datetime import date as _date
from difflib import SequenceMatcher

from . import categories as cats

# Close enough to be the same event once both titles are normalised.
THRESHOLD = 0.86

_NOISE = re.compile(
    r"\b(tickets?|ticketing|official|presents?|feat\.?|featuring|live in|live at|"
    r"at the|w/|with|edition|vol\.?|part|night|show|event|concert|beirut|lebanon)\b",
    re.I,
)


def normalize(title: str) -> str:
    """Strip a title down to the words that identify the act."""
    t = (title or "").lower()
    t = re.sub(r"\(.*?\)|\[.*?\]", " ", t)                      # "(Live)" / "[Sold out]"
    t = re.sub(r"\b\d{1,2}\s*[a-z]{3,9}\s*\d{0,4}\b", " ", t)   # a trailing "Sep 03"
    t = re.sub(r"\b(19|20)\d{2}\b", " ", t)                     # a year
    t = _NOISE.sub(" ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return " ".join(t.split())


def _similar(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # One title containing the other ("shimza" inside "shimza iris") is a match
    # a plain ratio scores badly, so treat containment as near-identical.
    if len(a) >= 4 and len(b) >= 4 and (a in b or b in a):
        return 0.95
    return SequenceMatcher(None, a, b).ratio()


def _days(event) -> set[str]:
    return {d.get("date") for d in (event.get("dates") or []) if d.get("date")}


def _sort_dates(event) -> None:
    seen, out = set(), []
    for d in sorted(event.get("dates") or [], key=lambda x: (x.get("date") or "", x.get("time") or "")):
        key = (d.get("date"), d.get("time"), d.get("url"))
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    event["dates"] = out


def set_primary(event, today: str | None = None) -> None:
    """`date`/`time` on the card: the next night still to come, else the first."""
    _sort_dates(event)
    today = today or _date.today().isoformat()
    days = [d for d in event["dates"] if d.get("date")]
    if not days:
        event["primaryDate"], event["primaryTime"] = None, ""
        return
    nxt = next((d for d in days if d["date"] >= today), days[0])
    event["primaryDate"], event["primaryTime"] = nxt["date"], nxt.get("time", "")


def merge_runs(events: list[dict]) -> tuple[list[dict], int]:
    """Fold each source's separate nights of one show into a single event.

    Same source, same venue and near-identical titles = one run. The earliest
    listing supplies the page content (title, image, description) and every
    night becomes a `dates` entry with its own booking link.
    """
    kept: list[dict] = []
    index: list[tuple[str, str, str]] = []  # (source, venue, normalized title)
    merged = 0

    for e in sorted(events, key=lambda x: (x.get("primaryDate") or "9999-12-31")):
        title = normalize(e.get("title", ""))
        venue = (e.get("venue") or "").strip().lower()
        hit = None
        for pos, (src, other_venue, other_title) in enumerate(index):
            if src != e.get("source") or other_venue != venue:
                continue
            if _similar(title, other_title) >= THRESHOLD:
                hit = pos
                break
        if hit is None:
            kept.append(e)
            index.append((e.get("source"), venue, title))
            continue

        winner = kept[hit]
        winner["dates"].extend(e.get("dates") or [])
        # Keep every night's own listing id, so re-runs still recognise the run
        # even if the site retires the night we happened to key it on.
        winner.setdefault("mergedIds", []).append(e.get("externalId"))
        set_primary(winner)
        merged += 1

    for e in kept:
        set_primary(e)
    return kept, merged


def collapse(events: list[dict], order: list[str]) -> tuple[list[dict], list[dict]]:
    """Drop the same event listed on a second site.

    `order` is the source priority — earlier wins. Each kept event gains an
    `alsoOn` list naming the other sites it was found on (shown in the admin
    log), and inherits a better category if the loser had one: ihjoz publishes
    an editorial event type, while Tick'it only exposes music genres, so the
    loser is sometimes the better-classified listing.
    """
    rank = {key: i for i, key in enumerate(order)}
    ordered = sorted(range(len(events)),
                     key=lambda i: (rank.get(events[i].get("source"), 99), i))

    kept: list[dict] = []
    keys: list[tuple[str, set[str]]] = []
    dropped: list[dict] = []
    vague = {cats.FALLBACK, cats.GENRE_DEFAULT}

    for i in ordered:
        e = events[i]
        title = normalize(e.get("title", ""))
        days = _days(e)
        match = None
        for pos, (other_title, other_days) in enumerate(keys):
            if not (days & other_days):
                continue
            if _similar(title, other_title) >= THRESHOLD:
                match = pos
                break
        if match is None:
            e.setdefault("alsoOn", [])
            kept.append(e)
            keys.append((title, days))
            continue

        winner = kept[match]
        winner["alsoOn"].append({"source": e.get("source"), "url": e.get("ticketUrl")})
        if winner.get("categoryName") in vague and e.get("categoryName") not in vague:
            winner["categoryName"] = e["categoryName"]
        dropped.append({
            "source": e.get("source"),
            "externalId": e.get("externalId"),
            "mergedIds": e.get("mergedIds") or [],
            "title": e.get("title"),
            "url": e.get("ticketUrl"),
            "duplicateOf": {"source": winner.get("source"),
                            "externalId": winner.get("externalId"),
                            "title": winner.get("title")},
        })

    kept.sort(key=lambda e: (e.get("primaryDate") or "9999-12-31", e.get("title") or ""))
    return kept, dropped


def drop_past(events: list[dict], today: str | None = None) -> tuple[list[dict], list[dict]]:
    """Split off events whose last night has already been and gone.

    Every source carries some stale rows (ihjoz still lists 2025 workshops), and
    an events page opening with last year is worse than one that is short.
    """
    today = today or _date.today().isoformat()
    live, past = [], []
    for e in events:
        days = _days(e)
        (live if (days and max(days) >= today) else past).append(e)
    return live, past
