#!/usr/bin/env python3
"""Persist full-wrap derived product mockup records on artwork groups."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "backend" / "models.py"


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")
    if "derived_mockup_images: List[Dict[str, Any]]" in source:
        print("Derived mockup model field already applied.")
        return

    old = '''    artworks: List[ProductArtworkSlot] = Field(default_factory=list)\n    primary_mockup_image_url: Optional[str] = None\n    sort_order: int = 0\n'''
    new = '''    artworks: List[ProductArtworkSlot] = Field(default_factory=list)\n    primary_mockup_image_url: Optional[str] = None\n    derived_mockup_images: List[Dict[str, Any]] = Field(default_factory=list)\n    sort_order: int = 0\n'''

    if source.count(old) != 1:
        raise SystemExit(f"ABORT: expected one ProductArtworkGroup mockup block, found {source.count(old)}.")

    TARGET.write_text(source.replace(old, new, 1), encoding="utf-8")
    print("Added ProductArtworkGroup.derived_mockup_images.")


if __name__ == "__main__":
    main()
