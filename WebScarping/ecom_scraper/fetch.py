"""Fetching pages: plain HTTP by default, optional Playwright for JS sites."""

from __future__ import annotations

import time
import random
import socket
import threading
import urllib.robotparser
from urllib.parse import urlparse

import requests

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


# --- DNS --------------------------------------------------------------------
# A whole-shop run fetches thousands of pages from ONE host, and every fetch
# starts with a fresh getaddrinfo() -- so a 1,300-product crawl asks the
# resolver for the same name 1,300 times. Home routers and some ISP resolvers
# start dropping queries under that, and once they do, every worker fails at
# once with "getaddrinfo failed" and the run reports the whole shop as missing.
#
# Resolving each host once per run removes the burst entirely. The trade-off is
# a stale address if the site moves mid-run; over the ~30 minutes a run lasts,
# against a shop behind a stable CDN, that is a much smaller risk than the one
# it replaces. Failures are deliberately NOT cached, so a name that fails on
# the first attempt is retried normally rather than being poisoned for the run.
_dns_cache: dict = {}
_dns_lock = threading.Lock()
_real_getaddrinfo = socket.getaddrinfo


def _cached_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    key = (host, port, family, type, proto, flags)
    with _dns_lock:
        hit = _dns_cache.get(key)
    if hit is not None:
        return hit
    result = _real_getaddrinfo(host, port, family, type, proto, flags)
    with _dns_lock:
        _dns_cache[key] = result
    return result


def install_dns_cache():
    """Resolve each host once per process. Idempotent."""
    if socket.getaddrinfo is not _cached_getaddrinfo:
        socket.getaddrinfo = _cached_getaddrinfo


class Fetcher:
    """Fetches HTML. Reuses a session, retries, throttles, and (optionally)
    respects robots.txt."""

    def __init__(
        self,
        render: bool = False,
        delay: float = 1.0,
        timeout: int = 30,
        retries: int = 3,
        net_retries: int = 6,
        respect_robots: bool = True,
        headers: dict | None = None,
    ):
        install_dns_cache()
        self.render = render
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self.net_retries = net_retries
        self.respect_robots = respect_robots
        self.session = requests.Session()
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
        # Polite throttle with a little jitter.
        time.sleep(self.delay + random.uniform(0, self.delay * 0.3))
        return html

    def _http(self, url: str) -> str | None:
        """Fetch one page, retrying on two different ladders.

        A 5xx or a truncated response is this page's problem: retry a few times
        and move on. A DNS or connection failure is not -- the network itself
        went away, and every other worker is failing at the same moment. Three
        tries over six seconds is far too impatient for that; a resolver hiccup
        or a WiFi handover is usually over inside a minute, and giving up early
        turns a blip into hundreds of products silently missing from the run.
        """
        page_tries = 0
        net_tries = 0
        while True:
            try:
                resp = self.session.get(url, timeout=self.timeout)
                resp.raise_for_status()
                return resp.text
            except requests.RequestException as exc:
                if isinstance(exc, (requests.ConnectionError, requests.Timeout)):
                    net_tries += 1
                    if net_tries > self.net_retries:
                        print(f"  [error] {url}: {exc}")
                        return None
                    # 2, 4, 8, 16, 30, 30 -- ~90s of patience before giving up.
                    time.sleep(min(2 ** net_tries, 30))
                else:
                    page_tries += 1
                    if page_tries >= self.retries:
                        print(f"  [error] {url}: {exc}")
                        return None
                    time.sleep(2 ** page_tries)

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
