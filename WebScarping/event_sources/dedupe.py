"""Turn four ticketing sites' listings into one clean list of events.

Two different things both look like "duplicates" on the site, and they need
opposite treatment:

**A run** — one show playing many nights. Ticketing Box Office and Antoine
Ticketing model this themselves (a `group`, a `main` with `subs`), but Tick'it
and ihjoz publish each night as its own listing, so a ten-night stand-up run
arrives as ten identical-looking events. Those are *merged* into one event
carrying ten `dates`, each keeping its own booking link — the shape the site and
the API already understand.

**A cross-listing** — one event sold on two sites at once, which is routine in
Beirut ("SHIMZA at IRIS Beirut - Sep 03" on Tick'it is "SHIMZA Live at Iris
Beirut - Sep 03" on ihjoz). Those are *dropped*, keeping whichever source ranks
highest (see event_sources.SOURCES), and the dropped ids are reported so the
importer can clear a row an earlier run created. Any night only the dropped
listing sells moves onto the kept one, with its own booking link, so dropping a
duplicate never loses a date.

A cross-listing is recognised three ways, strictest first:

  1. same night, near-identical title           (any two listings)
  2. same night, same venue, the same words     (two different sites)
     — "Rula Korban - Chi Tayeb" is "Chi Tayib - Stand-up show by Rula
     Korban" on another site; word order and a transliteration differ, the
     night and the hall do not
  3. no shared night, same venue, near-identical title   (two different sites)
     — one run with its nights split between sites, which is a run, not two
     shows; a touring show plays different venues and stays several events

Every rule needs a shared night or a shared venue on top of the title, which is
what stops two unrelated events with a generic name from being welded together.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date as _date
from difflib import SequenceMatcher

from . import categories as cats

# Close enough to be the same event once both titles are normalised.
THRESHOLD = 0.86
# Rule 2's bar: the share of the shorter title's words the other one also has.
# Only ever applied with a shared night AND a shared venue.
LOOSE = 0.75
# Two spellings of one word: "tayib"/"tayeb", "ettihad"/"itihad".
_SPELLING = 0.8

_NOISE = re.compile(
    r"\b(tickets?|ticketing|official|presents?|feat\.?|featuring|live in|live at|"
    r"at the|w/|with|edition|vol\.?|part|night|show|event|concert|beirut|lebanon)\b",
    re.I,
)
# Words in a venue name that say what it is, not which one it is.
_VENUE_NOISE = {"the", "theatre", "theater", "venue", "beirut", "beyrouth", "lebanon", "liban"}
_NOT_WORD = re.compile(r"[^a-z0-9؀-ۿ]+")  # Arabic letters survive


def _fold(s: str) -> str:
    """Lowercase and drop accents, so "Théâtre" and "Theatre" are one word."""
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def normalize(title: str) -> str:
    """Strip a title down to the words that identify the act."""
    t = _fold(title)
    t = re.sub(r"\(.*?\)|\[.*?\]", " ", t)                      # "(Live)" / "[Sold out]"
    t = re.sub(r"\b\d{1,2}\s*[a-z]{3,9}\s*\d{0,4}\b", " ", t)   # a trailing "Sep 03"
    t = re.sub(r"\b(19|20)\d{2}\b", " ", t)                     # a year
    t = _NOISE.sub(" ", t)
    t = _NOT_WORD.sub(" ", t)
    return " ".join(t.split())


def _words(text: str, noise=frozenset()) -> set[str]:
    return {w for w in _NOT_WORD.sub(" ", _fold(text)).split() if len(w) >= 3 and w not in noise}


def _has(word: str, others: set[str]) -> bool:
    return word in others or any(SequenceMatcher(None, word, o).ratio() >= _SPELLING for o in others)


def _cover(a: set[str], b: set[str]) -> float:
    """Share of the shorter title's words the other title also has, in any order."""
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    if len(small) < 2:  # one word in common says nothing
        return 0.0
    return sum(1 for w in small if _has(w, big)) / len(small)


def _same_venue(a: set[str], b: set[str]) -> bool:
    """Every telling word of one venue name is in the other.

    Sites name a hall their own way: "Theatre Tournesol" / "Tournesol Tayouneh",
    "Théâtre Le Monnot" / "ACT | Le Monnot". Containment catches those, and a
    venue we know nothing about matches nothing.
    """
    if not a or not b:
        return False
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    return all(_has(w, big) for w in small)


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


def _key(event) -> dict:
    title = normalize(event.get("title", ""))
    return {
        "source": event.get("source"),
        "title": title,
        "words": _words(title),
        "days": _days(event),
        "venue": _words(event.get("venue") or "", _VENUE_NOISE),
    }


def _match(a: dict, b: dict) -> str | None:
    """Which rule (see the module docstring) makes `a` a listing of `b`, if any."""
    same_night = bool(a["days"] & b["days"])
    if same_night and _similar(a["title"], b["title"]) >= THRESHOLD:
        return "same night"
    # The looser rules lean on a shared venue, and only ever join two sites: one
    # site's own listings are already reconciled by merge_runs.
    if a["source"] == b["source"] or not _same_venue(a["venue"], b["venue"]):
        return None
    if same_night:
        score = max(_similar(a["title"], b["title"]), _cover(a["words"], b["words"]))
        return "same night, same venue" if score >= LOOSE else None
    return "same run" if _similar(a["title"], b["title"]) >= THRESHOLD else None


def _take_nights(winner: dict, loser: dict) -> int:
    """Copy onto `winner` every night only `loser` sells, with its own link.

    Matched on the day alone: two sites often disagree by half an hour on the
    same night (doors vs. curtain), and that is one night, not two.
    """
    have = _days(winner)
    extra = [d for d in loser.get("dates") or [] if d.get("date") and d["date"] not in have]
    if extra:
        winner["dates"].extend(extra)
        set_primary(winner)
    return len(extra)


def collapse(events: list[dict], order: list[str]) -> tuple[list[dict], list[dict]]:
    """Drop the same event listed on a second site.

    `order` is the source priority — earlier wins. Each kept event gains an
    `alsoOn` list naming the other sites it was found on (shown in the admin
    log), takes any night only the loser sells, and inherits a better category
    if the loser had one: ihjoz publishes an editorial event type, while Tick'it
    only exposes music genres, so the loser is sometimes the better-classified
    listing.
    """
    rank = {key: i for i, key in enumerate(order)}
    ordered = sorted(range(len(events)),
                     key=lambda i: (rank.get(events[i].get("source"), 99), i))

    kept: list[dict] = []
    keys: list[dict] = []
    dropped: list[dict] = []
    vague = {cats.FALLBACK, cats.GENRE_DEFAULT}

    for i in ordered:
        e = events[i]
        key = _key(e)
        match, rule = None, None
        for pos, other in enumerate(keys):
            rule = _match(key, other)
            if rule:
                match = pos
                break
        if match is None:
            e.setdefault("alsoOn", [])
            kept.append(e)
            keys.append(key)
            continue

        winner = kept[match]
        winner["alsoOn"].append({"source": e.get("source"), "url": e.get("ticketUrl")})
        if winner.get("categoryName") in vague and e.get("categoryName") not in vague:
            winner["categoryName"] = e["categoryName"]
        added = _take_nights(winner, e)
        # A third site may list one of the nights just taken over.
        keys[match]["days"] = _days(winner)
        dropped.append({
            "source": e.get("source"),
            "externalId": e.get("externalId"),
            "mergedIds": e.get("mergedIds") or [],
            "title": e.get("title"),
            "url": e.get("ticketUrl"),
            "rule": rule,
            "nightsAdded": added,
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
