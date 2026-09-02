"""One category vocabulary for three ticketing sites.

Each source names things its own way — Ticketing Box Office has editorial
categories ("Theatrical plays"), ihjoz has an event-type dropdown ("concert"),
and Tick'it only has music genres ("Afro House", "Comedy"). Left alone that
would give the site three near-duplicate tiles for the same thing, so every
source label is folded into the canonical list below **before** it reaches the
database.

The canonical names deliberately reuse the ones already in Postgres from the
Ticketing Box Office sync, so their admin-set tile images survive the change.

This map is the tuning point: to re-file a genre, edit `ALIASES` — nothing else
needs to change. Categories the admin renames in the dashboard are left alone by
the importer (slug is identity, the name is theirs).
"""

from __future__ import annotations

import re

from .common import slugify

# Canonical name -> a fallback tile image, used only when the category is created
# for the first time and no source handed us one. Empty means "no image yet";
# the admin can upload one at /admin/categories.
CANONICAL = [
    "Concerts",
    "Parties & Clubbing",
    "Comedy",
    "Theatrical plays",
    "Ballet and Dance",
    "Sports",
    "Festivals",
    "Workshops",
    "Activities",
    "Cinema",
    "Gala Dinner Concerts",
    "Events",
]

FALLBACK = "Events"  # anything we can't place

# Lowercased source label -> canonical name.
ALIASES = {
    # --- Ticketing Box Office (its own editorial categories) ---
    "concerts": "Concerts",
    "theatrical plays": "Theatrical plays",
    "ballet and dance": "Ballet and Dance",
    "gala dinner concerts": "Gala Dinner Concerts",
    "sports": "Sports",
    "workshops": "Workshops",
    "events": "Events",

    # --- ihjoz (its /events/browse event-type tags) ---
    "concert": "Concerts",
    "party": "Parties & Clubbing",
    "clubbing": "Parties & Clubbing",
    "nightlife": "Parties & Clubbing",
    "festival": "Festivals",
    "activity": "Activities",
    "tourism": "Activities",
    "classes": "Workshops",
    "workshop": "Workshops",
    "theatre": "Theatrical plays",
    "theater": "Theatrical plays",
    "performance": "Theatrical plays",
    "cinema": "Cinema",
    "movie": "Cinema",
    "comedy": "Comedy",
    "sport": "Sports",
    "exhibition": "Events",
    "conference": "Events",

    # --- Tick'it (music genres). Live-music genres read as a gig; the rest are
    # club nights, which is what Tick'it is mostly used for in Lebanon. ---
    "jazz": "Concerts",
    "classical": "Concerts",
    "opera": "Concerts",
    "rock": "Concerts",
    "indie": "Concerts",
    "metal": "Concerts",
    "acoustic": "Concerts",
    "folk": "Concerts",
    "live": "Concerts",
    "live music": "Concerts",
    "stand-up": "Comedy",
    "stand up": "Comedy",
}

# Every other Tick'it genre lands here rather than becoming its own tile.
GENRE_DEFAULT = "Parties & Clubbing"


def canonical(label: str, *, genre: bool = False) -> str:
    """Fold one source label into the canonical vocabulary.

    `genre=True` marks a Tick'it music genre, so an unknown label becomes a club
    night instead of the generic catch-all.
    """
    key = (label or "").strip().lower()
    if not key:
        return FALLBACK
    if key in ALIASES:
        return ALIASES[key]
    for name in CANONICAL:
        if key == name.lower():
            return name
    return GENRE_DEFAULT if genre else FALLBACK


def pick(labels, *, genre: bool = False) -> str:
    """Choose one category for an event that carries several labels.

    Tick'it tags a night with every genre played; ihjoz adds free-text keywords.
    The first label that maps to something specific wins, so a
    ["Afro House", "Comedy"] night files under Comedy rather than the default.
    """
    mapped = [canonical(l, genre=genre) for l in (labels or []) if l]
    specific = [m for m in mapped if m not in (FALLBACK, GENRE_DEFAULT)]
    if specific:
        return specific[0]
    return mapped[0] if mapped else FALLBACK


def entry(name: str, image: str = "") -> dict:
    return {"name": name, "slug": slugify(name), "image": image or ""}


# A title says more than a genre does. These only fire when the source left us
# with a vague category — an editorial tag from the site itself is always
# trusted over a keyword.
_REFINE = [
    ("Gala Dinner Concerts", r"\bgala\s+dinner\b"),
    ("Ballet and Dance", r"\bballet\b|\bdance\s+(?:show|performance|company)\b"),
    ("Comedy", r"\bstand[\s-]?up\b|\bcomedy\b|\bopen\s+mic\b|\bimprov\b"),
    ("Cinema", r"\bscreening\b|\bcinema\b|\bfilm\b|\bmovie\b"),
    ("Festivals", r"\bfestival\b"),
    ("Workshops", r"\bworkshop\b|\bmasterclass\b|\btraining\b|\bbootcamp\b"),
    ("Theatrical plays", r"\bthe\s?atre\b|\bplay\b|\bmonodrama\b"),
    ("Concerts", r"\bin\s+concert\b|\brecital\b|\bsymphony\b|\borchestra\b|\btribute\b"),
    ("Sports", r"\btournament\b|\bchampionship\b|\bmarathon\b|\bmatch\b"),
]


def refine(current: str, title: str) -> str:
    """Improve a vague category from what the event calls itself."""
    if current not in (FALLBACK, GENRE_DEFAULT):
        return current
    text = (title or "").lower()
    for name, pattern in _REFINE:
        if re.search(pattern, text):
            return name
    return current
