"""Shared helpers for the event-source adapters: HTTP, slugs, dates, text."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone

import requests

USER_AGENT = "Mozilla/5.0 (compatible; ASCompanyBot/1.0; +https://www.as.com.lb)"

_MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], 1)}
for _m, _i in list(_MONTHS.items()):
    _MONTHS[_m[:3]] = _i


class Fetcher:
    """A polite requests session: shared UA, a delay between calls, retries.

    Every adapter gets the same one so `--delay` throttles the whole run rather
    than each site separately.
    """

    def __init__(self, delay: float = 0.3, timeout: int = 30, retries: int = 2):
        self.delay = max(0.0, delay)
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def _sleep(self):
        if self.delay:
            time.sleep(self.delay)

    def get(self, url: str, **kw) -> str | None:
        """GET a page and return its text, or None if it never came back."""
        for attempt in range(self.retries + 1):
            try:
                r = self.session.get(url, timeout=self.timeout, **kw)
                r.raise_for_status()
                self._sleep()
                return r.text
            except Exception as exc:  # noqa: BLE001 — a dead page must not kill the run
                if attempt == self.retries:
                    print(f"  ! failed {url}: {exc}")
                    return None
                time.sleep(0.8 * (attempt + 1))
        return None

    def json(self, url: str, method: str = "get", **kw):
        """Same, for a JSON endpoint. Returns the decoded body or None."""
        for attempt in range(self.retries + 1):
            try:
                r = self.session.request(method, url, timeout=self.timeout, **kw)
                r.raise_for_status()
                self._sleep()
                return r.json()
            except Exception as exc:  # noqa: BLE001
                if attempt == self.retries:
                    print(f"  ! failed {url}: {exc}")
                    return None
                time.sleep(0.8 * (attempt + 1))
        return None


def slugify(s: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower().strip()))


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def strip_html(s: str) -> str:
    """Turn a description blob (ihjoz/tickit send HTML) into readable text."""
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", s or "", flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<")
          .replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'"))
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def parse_date(text: str) -> str | None:
    """'Friday 19 June 2026 | 07:00 PM' / 'Sat, September 12, 2026' -> '2026-06-19'."""
    text = text or ""
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b", text)
    if m:
        day, mon, year = int(m.group(1)), _MONTHS.get(m.group(2).capitalize()), int(m.group(3))
        if mon:
            return f"{year:04d}-{mon:02d}-{day:02d}"
    # "September 12, 2026" (month first)
    m = re.search(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b", text)
    if m:
        mon, day, year = _MONTHS.get(m.group(1).capitalize()), int(m.group(2)), int(m.group(3))
        if mon:
            return f"{year:04d}-{mon:02d}-{day:02d}"
    # ISO, already
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", text)
    return m.group(0) if m else None


def parse_time(text: str) -> str:
    """Pull a display time out of free text, normalised to '07:30 PM'."""
    m = re.search(r"(\d{1,2}:\d{2})\s*([AaPp])\.?[Mm]\.?", text or "")
    if m:
        return f"{m.group(1)} {m.group(2).upper()}M"
    m = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text or "")
    if not m:
        return ""
    return _fmt_24h(int(m.group(1)), int(m.group(2)))


def _fmt_24h(hour: int, minute: int) -> str:
    suffix = "AM" if hour < 12 else "PM"
    h12 = hour % 12 or 12
    return f"{h12:02d}:{minute:02d} {suffix}"


def from_epoch(seconds: float, tz_offset_minutes: int = 0) -> tuple[str, str]:
    """Firestore-style timestamp -> ('2026-09-05', '08:00 PM') in the venue's zone."""
    dt = datetime.fromtimestamp(seconds + tz_offset_minutes * 60, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d"), _fmt_24h(dt.hour, dt.minute)


def excerpt(text: str, limit: int = 140) -> str:
    line = clean(strip_html(text))
    return line[: limit - 3] + "…" if len(line) > limit else line
