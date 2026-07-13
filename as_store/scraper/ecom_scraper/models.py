"""Data model for a scraped product."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class Product:
    """A single product. Fields left as None/empty when not found on the page."""

    url: str = ""
    name: str | None = None
    brand: str | None = None
    sku: str | None = None
    price: float | None = None
    currency: str | None = None
    availability: str | None = None
    rating: float | None = None
    review_count: int | None = None
    description: str | None = None
    # Structured specification rows pulled out of the description tab, as
    # [label, value] pairs (e.g. ["Processor", "Intel Core i9-14900HX"]).
    specs: list[list[str]] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    # Ordered category trail from the page breadcrumb (parent → leaf), e.g.
    # ["Networking", "Switches"]. Drives the 2-level category hierarchy on ingest;
    # `categories` (flat, from JSON-LD) is the fallback.
    category_path: list[str] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    # Local file paths for downloaded images (populated by --images).
    image_files: list[str] = field(default_factory=list)
    # Anything extra a custom selector grabbed that has no dedicated field.
    extra: dict[str, Any] = field(default_factory=dict)

    def is_empty(self) -> bool:
        """True if we found essentially nothing useful."""
        return not (self.name or self.price or self.images)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_flat_dict(self) -> dict[str, Any]:
        """Spreadsheet-friendly: lists joined with ' | ', extras flattened."""
        d = self.to_dict()
        d["categories"] = " | ".join(self.categories)
        d["category_path"] = " > ".join(self.category_path)
        d["images"] = " | ".join(self.images)
        d["image_files"] = " | ".join(self.image_files)
        d["specs"] = " | ".join(
            f"{row[0]}: {row[1]}" for row in self.specs if isinstance(row, (list, tuple)) and len(row) >= 2
        )
        extra = d.pop("extra")
        for k, v in extra.items():
            if isinstance(v, (list, tuple)):
                v = " | ".join(map(str, v))
            d[f"extra_{k}"] = v
        return d

    def merge(self, other: "Product") -> None:
        """Fill any empty field on self from other (self wins where set)."""
        for key, val in other.to_dict().items():
            cur = getattr(self, key)
            if key in ("categories", "images", "image_files"):
                # Union lists, preserving order, no duplicates.
                merged = list(dict.fromkeys([*cur, *val]))
                setattr(self, key, merged)
            elif key == "extra":
                merged_extra = {**val, **cur}
                setattr(self, key, merged_extra)
            elif cur in (None, "", []) and val not in (None, "", []):
                setattr(self, key, val)
