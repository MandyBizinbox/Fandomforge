#!/usr/bin/env python3
"""Seed Phase 1 BizSupply-backed product templates.

This imports product template/library records only. It does not create creator
store products.
"""

from __future__ import annotations

import csv
import os
import re
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "imports" / "bizsupply-p1-seed.csv"
ALLOWED_STATUSES = {"Seed candidate", "Review before seed"}
CREATOR_PENDING_PRODUCT_TYPES = {
    "Bookmarks & Cards",
    "Caps & Headwear",
    "Cotton Hoodie",
    "Cotton T-Shirt",
    "Hoodies",
    "T-Shirts",
    "Zippered Hoodie",
    "Sport Bibs",
}


def load_mongo_client():
    try:
        from pymongo import MongoClient

        return MongoClient
    except ModuleNotFoundError:
        for site_packages in sorted((ROOT / "backend" / "venv" / "lib").glob("python*/site-packages")):
            sys.path.insert(0, str(site_packages))
        from pymongo import MongoClient

        return MongoClient


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid() -> str:
    return str(uuid.uuid4())


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or f"template-{uid()[:8]}"


def parse_money(value: str) -> float | None:
    raw = str(value or "").strip().replace("R", "").replace(",", "")
    if not raw:
        return None
    try:
        amount = Decimal(raw)
    except InvalidOperation:
        return None
    if amount <= 0:
        return None
    return float(amount)


def split_csvish(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def parse_attributes(value: str) -> dict[str, list[str]]:
    attrs: dict[str, list[str]] = {}
    for chunk in str(value or "").split(";"):
        if ":" not in chunk:
            continue
        key, raw_values = chunk.split(":", 1)
        key = key.strip()
        values = split_csvish(raw_values)
        if key and values:
            attrs[key] = values
    return attrs


def clean_row(row: dict[str, str]) -> dict[str, str]:
    return {key: (value or "").strip() for key, value in row.items()}


def mongo_database():
    MongoClient = load_mongo_client()
    mongo_url = (
        os.environ.get("MONGO_URL")
        or os.environ.get("MONGODB_URL")
        or "mongodb://127.0.0.1:27017/fandomforge"
    )
    db_name = os.environ.get("DB_NAME") or os.environ.get("MONGO_DB") or "fandomforge"
    client = MongoClient(mongo_url)
    return client[db_name]


def load_rows() -> list[dict[str, str]]:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Seed file not found: {CSV_PATH}")

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as handle:
        return [clean_row(row) for row in csv.DictReader(handle)]


def product_type_lookup(db) -> dict[str, dict[str, Any]]:
    docs = db.product_types.find({}, {"_id": 0})
    return {doc.get("name"): doc for doc in docs if doc.get("name")}


def seed_doc(row: dict[str, str], product_type: dict[str, Any] | None) -> dict[str, Any]:
    blank_min = parse_money(row.get("min_blank_price", ""))
    blank_max = parse_money(row.get("max_blank_price", ""))
    image_urls = split_csvish(row.get("image_urls", ""))
    attributes = parse_attributes(row.get("attributes", ""))
    valid_cost = blank_min is not None
    seed_status = row.get("seed_status", "")
    is_creator_ready = seed_status == "Seed candidate" and valid_cost
    status = "active" if is_creator_ready else "draft"
    base_cost = blank_min or 0
    creator_price = round(base_cost * 1.10, 2) if base_cost else 0
    slug = row.get("template_slug") or slugify(row.get("product_name", ""))
    supplier_product_id = row.get("bizsupply_id", "")
    variation_count = int(row.get("variation_count") or 0)
    now = now_iso()

    doc: dict[str, Any] = {
        "name": row.get("product_name", ""),
        "slug": f"bizsupply-{slug}-{supplier_product_id}".strip("-"),
        "template_slug": slug,
        "product_type": row.get("product_type", ""),
        "product_type_slug": slug,
        "product_type_id": (product_type or {}).get("id", ""),
        "category": (product_type or {}).get("category") or slug,
        "category_id": (product_type or {}).get("category_id"),
        "description": row.get("notes", ""),
        "brand": "BizSupply",
        "blank_sku": supplier_product_id,
        "supplier_name": row.get("product_name", ""),
        "supplier_url": f"https://bizsupply.co.za/?p={supplier_product_id}" if supplier_product_id else "",
        "supplier_notes": row.get("notes", ""),
        "supplier_categories": row.get("supplier_categories", ""),
        "supplier_product_id": supplier_product_id,
        "source": "bizsupply",
        "seed_source": "bizsupply-p1-seed.csv",
        "seed_status": seed_status,
        "seed_order": int(row.get("seed_order") or 0),
        "notes": row.get("notes", ""),
        "recommended_print_method": row.get("recommended_print_method", ""),
        "variation_count": variation_count,
        "raw_attributes": row.get("attributes", ""),
        "parsed_attributes": attributes,
        "blank_cost_min": blank_min,
        "blank_cost_max": blank_max,
        "base_price": base_cost,
        "base_blank_cost": base_cost,
        "platform_blank_cost": base_cost,
        "creator_blank_price": creator_price,
        "platform_blank_markup_type": "manual",
        "platform_blank_markup_value": 0,
        "product_mode": "template_printed",
        "production_mode": "printed_from_template",
        "requires_artwork": True,
        "supports_printing": True,
        "supports_mockups": True,
        "mockup_url": image_urls[0] if image_urls else None,
        "product_image_url": image_urls[0] if image_urls else None,
        "mockup_images": image_urls,
        "image_urls": image_urls,
        "mockup_screens": [],
        "available_sizes": [],
        "available_colors": [],
        "attribute_ids": list((product_type or {}).get("attribute_ids") or []),
        "selected_attribute_values": {},
        "variations": [],
        "print_option_ids": [],
        "print_options": [],
        "print_areas": [],
        "size_chart": {
            "enabled": False,
            "title": "Size Guide",
            "unit": "cm",
            "columns": ["Size", "Chest", "Length"],
            "rows": [],
            "notes": "",
        },
        "status": status,
        "admin_visible": True,
        "creator_visible": is_creator_ready,
        "created_at": now,
        "updated_at": now,
    }

    return doc


def hide_pending_product_types(db, seeded_types: set[str]) -> int:
    hidden_count = 0
    now = now_iso()
    for name in sorted(CREATOR_PENDING_PRODUCT_TYPES):
        has_visible_template = db.product_templates.count_documents(
            {
                "product_type": name,
                "source": "bizsupply",
                "status": "active",
                "creator_visible": True,
            }
        )
        if name in seeded_types and has_visible_template:
            continue

        result = db.product_types.update_many(
            {"name": name},
            {
                "$set": {
                    "status": "draft",
                    "creator_visible": False,
                    "admin_visible": True,
                    "hidden_reason": "Pending approved Phase 1 seeded template/source.",
                    "updated_at": now,
                }
            },
        )
        hidden_count += result.modified_count
    return hidden_count


def main() -> int:
    rows = load_rows()
    db = mongo_database()
    before_products = db.products.count_documents({})
    types_by_name = product_type_lookup(db)

    created = 0
    updated = 0
    skipped = 0
    seeded_types: set[str] = set()
    skipped_statuses: Counter[str] = Counter()

    for row in rows:
        seed_status = row.get("seed_status", "")
        if seed_status not in ALLOWED_STATUSES:
            skipped += 1
            skipped_statuses[seed_status] += 1
            continue

        product_type_name = row.get("product_type", "")
        product_type = types_by_name.get(product_type_name)
        doc = seed_doc(row, product_type)
        lookup = {
            "source": "bizsupply",
            "supplier_product_id": doc["supplier_product_id"],
            "template_slug": doc["template_slug"],
        }

        existing = db.product_templates.find_one(lookup, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
            doc["created_at"] = existing.get("created_at") or doc["created_at"]
            result = db.product_templates.update_one({"id": existing["id"]}, {"$set": doc})
            updated += result.modified_count
        else:
            doc["id"] = uid()
            db.product_templates.insert_one(doc)
            created += 1

        seeded_types.add(product_type_name)

    hidden_types = hide_pending_product_types(db, seeded_types)
    after_products = db.products.count_documents({})

    summary = {
        "csv_path": str(CSV_PATH),
        "rows_read": len(rows),
        "seed_status_breakdown": dict(Counter(row.get("seed_status", "") for row in rows)),
        "product_type_breakdown": dict(Counter(row.get("product_type", "") for row in rows)),
        "templates_created": created,
        "templates_updated": updated,
        "rows_skipped": skipped,
        "skipped_statuses": dict(skipped_statuses),
        "product_types_seeded": sorted(seeded_types),
        "product_types_hidden_from_creator_flow": sorted(CREATOR_PENDING_PRODUCT_TYPES),
        "product_types_modified_for_hide": hidden_types,
        "products_before": before_products,
        "products_after": after_products,
    }
    print(summary)

    if before_products != after_products:
        print("ERROR: products collection count changed; this seeder must not create live products.", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
