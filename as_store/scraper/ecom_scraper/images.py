"""Download product images to a local folder."""

from __future__ import annotations

import os
import re
import hashlib
from urllib.parse import urlparse

import requests

from .models import Product


def _safe_slug(text: str, fallback: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", (text or "").strip()).strip("-")
    return (slug[:60] or fallback).lower()


def _ext_from_url(url: str) -> str:
    path = urlparse(url).path
    ext = os.path.splitext(path)[1].lower()
    return ext if ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif") else ".jpg"


def download_images(product: Product, out_dir: str, session: requests.Session | None = None) -> None:
    """Download every image URL on the product into out_dir, recording local paths."""
    if not product.images:
        return
    os.makedirs(out_dir, exist_ok=True)
    sess = session or requests.Session()

    base = _safe_slug(product.sku or product.name or "", fallback=hashlib.md5(product.url.encode()).hexdigest()[:8])
    for idx, img_url in enumerate(product.images, 1):
        try:
            resp = sess.get(img_url, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as exc:
            print(f"    [image error] {img_url}: {exc}")
            continue
        suffix = f"-{idx}" if len(product.images) > 1 else ""
        filename = f"{base}{suffix}{_ext_from_url(img_url)}"
        path = os.path.join(out_dir, filename)
        with open(path, "wb") as fh:
            fh.write(resp.content)
        product.image_files.append(path)
