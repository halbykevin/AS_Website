"""Event-source adapters for the AS Company events sync.

Each adapter exposes ``fetch(session, limit=0) -> (categories, events)`` and a
``KEY`` that becomes ``events.source`` in Postgres (so re-runs upsert instead of
duplicating). ``events_sync.py`` runs them all, normalises the categories, drops
cross-source duplicates and writes one JSON file for the API to ingest.

Adding another ticketing site means writing one module here and listing it in
``SOURCES`` — nothing else in the pipeline needs to know about it.
"""

from . import antoine, ihjoz, tbo, tickit

# Order matters: it is the tie-break when the same real-world event is listed on
# more than one site (see dedupe.py). The incumbent goes first, and a newcomer
# joins at the end: the winner's row keeps its slug, so a show already on the
# site keeps the URL people and search engines have for it.
SOURCES = [tbo, tickit, ihjoz, antoine]

BY_KEY = {m.KEY: m for m in SOURCES}

__all__ = ["SOURCES", "BY_KEY", "tbo", "tickit", "ihjoz", "antoine"]
