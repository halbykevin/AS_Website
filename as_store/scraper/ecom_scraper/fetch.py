"""Fetching pages: plain HTTP by default, optional Playwright for JS sites."""

from __future__ import annotations

import time
import random
import threading
import urllib.robotparser
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class Fetcher:
    """Fetches HTML. Reuses a session, retries, throttles, and (optionally)
    respects robots.txt."""

    def __init__(
        self,
        render: bool = False,
        delay: float = 1.0,
        timeout: int = 30,
        retries: int = 2,
        respect_robots: bool = True,
        headers: dict | None = None,
    ):
        self.render = render
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self.respect_robots = respect_robots
        self.session = requests.Session()
        # The default urllib3 pool holds 10 connections per host — fewer than the
        # scraper's worker cap, so extra workers would open/close a connection per
        # request. Size the pool past the cap to keep every worker on keep-alive.
        adapter = HTTPAdapter(pool_connections=4, pool_maxsize=32)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self.session.headers.update(headers or DEFAULT_HEADERS)
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._browser = None
        self._pw = None
        self._render_warned = False
        self._robots_lock = threading.Lock()
        self._render_lock = threading.Lock()

    # -- robots.txt -------------------------------------------------------
    def allowed(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        with self._robots_lock:
            rp = self._robots.get(base)
            if rp is None:
                rp = urllib.robotparser.RobotFileParser()
                # Fetch robots.txt with OUR browser User-Agent. urllib's own
                # reader uses a default Python UA that Cloudflare-style sites
                # often 403 -- and a 403 is interpreted as "disallow all",
                # falsely blocking sites whose robots.txt actually allows us.
                try:
                    resp = self.session.get(f"{base}/robots.txt", timeout=self.timeout)
                    if resp.status_code == 200:
                        rp.parse(resp.text.splitlines())
                    else:
                        rp.allow_all = True   # no usable robots.txt -> allow
                except Exception:
                    rp.allow_all = True       # couldn't read -> allow
                self._robots[base] = rp
        ua = self.session.headers.get("User-Agent", "*")
        try:
            return rp.can_fetch(ua, url)
        except Exception:
            return True

    # -- fetching ---------------------------------------------------------
    def get(self, url: str) -> str | None:
        """Return page HTML, or None on failure / disallowed."""
        if not self.allowed(url):
            print(f"  [robots] disallowed: {url}")
            return None
        html = self._render(url) if self.render else self._http(url)
        # Polite throttle with a little jitter (delay 0 = full speed).
        if self.delay > 0:
            time.sleep(self.delay + random.uniform(0, self.delay * 0.3))
        return html

    def _http(self, url: str) -> str | None:
        for attempt in range(1, self.retries + 1):
            try:
                resp = self.session.get(url, timeout=self.timeout)
                resp.raise_for_status()
                return resp.text
            except requests.RequestException as exc:
                if attempt == self.retries:
                    print(f"  [error] {url}: {exc}")
                    return None
                time.sleep(2 ** attempt)
        return None

    def _render(self, url: str) -> str | None:
        try:
            # Playwright's sync API isn't thread-safe; serialise browser use.
            with self._render_lock:
                page = self._browser_page()
                page.goto(url, timeout=self.timeout * 1000, wait_until="networkidle")
                content = page.content()
                page.close()
            return content
        except Exception as exc:
            # Most common cause: Playwright (or its browser) isn't installed.
            # Don't crash the run -- warn once and fall back to plain HTTP, which
            # works for the large majority of stores.
            if not self._render_warned:
                reason = "browser not installed" if "executable" in str(exc).lower() else "render failed"
                print(f"  [render] {reason}; using plain HTTP instead.")
                print("           To enable JavaScript rendering, run once:")
                print("               pip install playwright")
                print("               playwright install chromium")
                self._render_warned = True
            self.render = False  # stop trying for the remaining pages
            return self._http(url)

    def _browser_page(self):
        if self._browser is None:
            from playwright.sync_api import sync_playwright

            self._pw = sync_playwright().start()
            self._browser = self._pw.chromium.launch(headless=True)
        return self._browser.new_page()

    def close(self):
        if self._browser is not None:
            self._browser.close()
        if self._pw is not None:
            self._pw.stop()
        self.session.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
