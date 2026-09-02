#!/usr/bin/env python3
"""Scrape events + categories from every ticketing partner into one JSON file
the AS Company API ingests into Postgres.

Sources live in event_sources/ (one module each: ticketingboxoffice.com,
tickit.co, ihjoz.com). This script runs them, folds their different category
vocabularies into one (categories.py), then puts everything through the same
three-step clean-up (dedupe.py):

  1. runs       - one show playing many nights becomes ONE event, many dates
  2. past       - anything whose last night has been and gone is dropped
  3. cross-list - the same event sold on two sites is kept once

  python events_sync.py --out events.json
  python events_sync.py --out events.json --sources tickit,ihjoz --limit 5
  python events_sync.py --out events.json --country ""          # every country

Progress goes to stdout (the admin dashboard streams it as the job log); the
structured result is written to --out:

  {"categories": [...], "events": [...], "sources": {...},
   "duplicates": [...], "past": [...], "complete": true}

Exit codes: 0 all sources succeeded - 3 some succeeded (partial run, so the
importer will not prune) - 1 nothing was scraped.
"""

from __future__ import annotations

import argparse
import json
import sys

from event_sources import BY_KEY, SOURCES, dedupe
from event_sources import categories as cats
from event_sources.common import Fetcher, excerpt, slugify

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def _finish(event: dict) -> dict:
    """Fill the derived fields every event needs before the clean-up runs."""
    if not event.get("excerpt"):
        event["excerpt"] = excerpt(event.get("description", ""))
    event["categoryName"] = cats.refine(event.get("categoryName") or cats.FALLBACK,
                                        event.get("title", ""))
    event.setdefault("alsoOn", [])
    dedupe.set_primary(event)
    return event


def _merge_categories(tile_lists: list[list[dict]], used: set[str]) -> list[dict]:
    """One tile per canonical category, in canonical order.

    Only categories an event actually landed in are shipped, so the site never
    grows an empty tile; the first image any source handed us wins, and a
    category no source pictured goes out with an empty image for the admin to
    fill in at /admin/categories.
    """
    merged: dict[str, dict] = {}
    for tiles in tile_lists:
        for t in tiles:
            slug = t.get("slug") or slugify(t.get("name", ""))
            if not slug:
                continue
            cur = merged.setdefault(slug, {"name": t["name"], "slug": slug, "image": ""})
            if not cur["image"] and t.get("image"):
                cur["image"] = t["image"]

    by_canonical = {slugify(n): n for n in cats.CANONICAL}
    for slug in used:
        merged.setdefault(slug, {"name": by_canonical.get(slug, slug), "slug": slug, "image": ""})

    rank = {slug: i for i, slug in enumerate(by_canonical)}
    return sorted((c for slug, c in merged.items() if slug in used),
                  key=lambda c: (rank.get(c["slug"], 99), c["name"]))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Sync events from the ticketing partners.")
    ap.add_argument("--out", required=True, help="Path to write the result JSON.")
    ap.add_argument("--sources", default="",
                    help="Comma-separated source keys (default: all). "
                         f"Available: {', '.join(BY_KEY)}")
    ap.add_argument("--country", default="Lebanon",
                    help="Restrict the multi-country sites to one country ('' = all).")
    ap.add_argument("--delay", type=float, default=0.3, help="Seconds between requests.")
    ap.add_argument("--limit", type=int, default=0, help="Max events per source (0 = all).")
    ap.add_argument("--include-past", action="store_true",
                    help="Keep events whose last night has already passed.")
    args = ap.parse_args(argv)

    wanted = [s.strip() for s in args.sources.split(",") if s.strip()] if args.sources else list(BY_KEY)
    unknown = [s for s in wanted if s not in BY_KEY]
    if unknown:
        print(f"Unknown source(s): {', '.join(unknown)}")
        return 1
    mods = [BY_KEY[k] for k in wanted]

    f = Fetcher(delay=args.delay)
    tile_lists: list[list[dict]] = []
    all_events: list[dict] = []
    report: dict[str, dict] = {}

    for mod in mods:
        print(f"\n=== {mod.LABEL} ({mod.KEY}) ===")
        try:
            tiles, events = mod.fetch(f, limit=args.limit, country=args.country)
        except Exception as exc:  # noqa: BLE001 - one dead site must not lose the rest
            print(f"  ! {mod.LABEL} failed: {exc}")
            report[mod.KEY] = {"ok": False, "events": 0, "error": str(exc)}
            continue
        events = [_finish(e) for e in events]
        tile_lists.append(tiles)
        all_events.extend(events)
        report[mod.KEY] = {"ok": True, "events": len(events), "error": None}
        print(f"  -> {len(events)} event(s)")

    ok_sources = [k for k, v in report.items() if v["ok"]]
    if not all_events:
        print("\nNothing was scraped - leaving the site untouched.")
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"categories": [], "events": [], "sources": report, "duplicates": [],
                       "past": [], "complete": False, "country": args.country},
                      fh, ensure_ascii=False, indent=2)
        return 1

    # 1. One show over many nights is one event. Ticketing Box Office already
    #    groups them; Tick'it and ihjoz publish every night as its own listing.
    all_events, runs = dedupe.merge_runs(all_events)
    print("\n=== Runs ===")
    print(f"  {runs} extra night(s) folded into a multi-date event" if runs
          else "  no multi-night runs found")

    # 2. Nothing already over - every source carries stale rows (ihjoz still
    #    lists workshops from last year).
    all_events, past = dedupe.drop_past(all_events)
    if args.include_past:
        all_events.extend(past)
        past = []
    print("\n=== Past ===")
    for e in past:
        print(f"  - {e['source']}: {e['title']} ({e['primaryDate']})")
    if not past:
        print("  none")

    # 3. The same event sold on two sites at once. Priority follows the order in
    #    event_sources.SOURCES, narrowed to what this run asked for.
    order = [m.KEY for m in SOURCES if m.KEY in wanted]
    kept, dropped = dedupe.collapse(all_events, order)
    print("\n=== Cross-listed ===")
    for d in dropped:
        print(f"  - {d['source']}: {d['title']}"
              f"  ==  {d['duplicateOf']['source']}: {d['duplicateOf']['title']}")
    if not dropped:
        print("  none")

    used = {slugify(e["categoryName"]) for e in kept}
    categories = _merge_categories(tile_lists, used)

    result = {
        "categories": categories,
        "events": kept,
        "sources": report,
        "duplicates": dropped,
        "past": [{"source": e["source"], "externalId": e["externalId"],
                  "mergedIds": e.get("mergedIds") or [], "title": e["title"],
                  "date": e["primaryDate"]} for e in past],
        "runsMerged": runs,
        # The importer only clears events a source has stopped listing when the
        # run was complete - a partial crawl looks exactly like a mass delisting.
        "complete": len(ok_sources) == len(wanted) and not args.limit,
        "country": args.country,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)

    print("\n=== Summary ===")
    for key in wanted:
        r = report.get(key, {})
        state = "ok  " if r.get("ok") else "FAIL"
        err = f"  - {r['error']}" if r.get("error") else ""
        print(f"  {key:<22} {state} {r.get('events', 0):>4} listing(s){err}")
    print(f"  {'nights merged':<22}      {runs:>4}")
    print(f"  {'past, skipped':<22}      {len(past):>4}")
    print(f"  {'cross-listed, dropped':<22}      {len(dropped):>4}")
    print(f"  {'kept':<22}      {len(kept):>4} event(s) in {len(categories)} categories")
    for c in categories:
        n = sum(1 for e in kept if slugify(e["categoryName"]) == c["slug"])
        print(f"      {c['name']:<24} {n}")
    print(f"\nWritten to {args.out}")

    if not ok_sources:
        return 1
    return 0 if result["complete"] or args.limit else 3


if __name__ == "__main__":
    sys.exit(main())
