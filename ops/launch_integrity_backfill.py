#!/usr/bin/env python3
"""Additive FandomForge launch-integrity provenance backfill.

Dry-run is the default. The script refuses to alter financial amounts, completed
payouts or uploaded files. It fills only values that can be derived directly from
existing records and marks unknown historic allocations as unavailable.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def apply_updates(collection, updates: list[UpdateOne], apply: bool) -> int:
    if not updates:
        return 0
    if not apply:
        return len(updates)
    result = collection.bulk_write(updates, ordered=False)
    return result.modified_count + result.upserted_count


def product_updates(db) -> list[UpdateOne]:
    updates = []
    projection = {
        "_id": 0, "id": 1, "band_id": 1, "creator_id": 1, "creator_account_id": 1,
        "store_id": 1, "product_version": 1, "template_version": 1,
        "created_by_user_id": 1, "created_by_role": 1, "created_at": 1,
        "integrity_provenance": 1,
    }
    for row in db.products.find({}, projection):
        patch: Dict[str, Any] = {}
        creator_id = row.get("creator_id") or row.get("band_id")
        if creator_id:
            patch.setdefault("creator_id", creator_id)
            patch.setdefault("creator_account_id", creator_id)
            patch.setdefault("store_id", creator_id)
        if row.get("product_version") is None:
            patch["product_version"] = 1
        if not row.get("template_version"):
            patch["template_version"] = "legacy-unversioned"
        if not row.get("integrity_provenance"):
            patch["integrity_provenance"] = {
                "status": "legacy_additive_backfill",
                "source": "existing_product_record",
                "financial_values_modified": False,
                "backfilled_at": utc_iso(),
            }
        if patch:
            updates.append(UpdateOne({"id": row["id"]}, {"$set": patch}))
    return updates


def artwork_updates(db) -> list[UpdateOne]:
    updates = []
    for row in db.artworks.find({}, {"_id": 0}):
        url = row.get("immutable_asset_url") or row.get("file_url") or row.get("original_url") or row.get("url") or ""
        patch: Dict[str, Any] = {}
        if url and not row.get("immutable_asset_url"):
            patch["immutable_asset_url"] = url
        if not row.get("content_sha256"):
            # Historic files may not be available on the migration host. Hash the
            # stable URL reference and record that provenance instead of claiming
            # this is a file-content hash.
            patch["content_sha256"] = hashlib.sha256(str(url).encode()).hexdigest()
            patch["hash_provenance"] = "legacy_url_reference"
        if row.get("asset_version") is None:
            patch["asset_version"] = 1
        digest = patch.get("content_sha256") or row.get("content_sha256")
        if digest and not row.get("asset_version_id"):
            patch["asset_version_id"] = f"asset-{digest[:24]}"
        if not row.get("integrity_provenance"):
            patch["integrity_provenance"] = {
                "status": "legacy_additive_backfill",
                "source": "existing_artwork_record",
                "file_replaced": False,
                "backfilled_at": utc_iso(),
            }
        if patch:
            updates.append(UpdateOne({"id": row["id"]}, {"$set": patch}))
    return updates


def order_updates(db) -> list[UpdateOne]:
    updates = []
    for order in db.orders.find({}, {"_id": 0}):
        patch: Dict[str, Any] = {}
        if not order.get("integrity_provenance"):
            patch["integrity_provenance"] = {
                "status": "legacy_preserved",
                "source": "original_order_record",
                "historical_financial_values_modified": False,
                "unknown_allocations": "legacy_unavailable",
                "marked_at": utc_iso(),
            }
        if not order.get("financial_snapshot"):
            patch["financial_snapshot_availability"] = {
                "status": "legacy_unavailable",
                "reason": "Original order predates launch-integrity allocation snapshots",
                "historical_source": "original_stored_order_values",
            }
        items = list(order.get("items") or [])
        changed = False
        for item in items:
            snapshot = dict(item.get("production_snapshot") or {})
            additions = {
                "creator_id": item.get("creator_id") or item.get("band_id"),
                "store_id": item.get("band_id"),
                "product_id": item.get("product_id"),
                "variation_id": item.get("variation_id"),
                "quantity": item.get("quantity"),
                "immutable": True,
                "legacy_snapshot_provenance": "existing_order_item_fields",
            }
            for key, value in additions.items():
                if value is not None and snapshot.get(key) is None:
                    snapshot[key] = value
                    changed = True
            if not item.get("financial_snapshot"):
                item.setdefault("financial_snapshot_availability", {
                    "status": "legacy_unallocated",
                    "historical_source": "original_item_values",
                })
                changed = True
            item["production_snapshot"] = snapshot
        if changed:
            patch["items"] = items
        if patch:
            updates.append(UpdateOne({"id": order["id"]}, {"$set": patch}))
    return updates


def subscription_updates(db) -> list[UpdateOne]:
    updates = []
    for row in db.account_subscriptions.find({}, {"_id": 0}):
        patch: Dict[str, Any] = {}
        if not row.get("integrity_provenance"):
            patch["integrity_provenance"] = {
                "status": "legacy_additive_backfill",
                "source": "existing_subscription_record",
                "pricing_modified": False,
                "backfilled_at": utc_iso(),
            }
        if row.get("plan_id") and not row.get("plan_version"):
            plan = db.subscription_plans.find_one({"id": row.get("plan_id")}, {"_id": 0}) or {}
            patch["plan_version"] = plan.get("version") or plan.get("updated_at") or "legacy-unversioned"
        if patch:
            updates.append(UpdateOne({"id": row["id"]}, {"$set": patch}))
    return updates


def ensure_indexes(db, apply: bool) -> list[str]:
    definitions = [
        (db.products, [("creator_id", 1), ("status", 1)], "creator_status_integrity"),
        (db.artworks, [("asset_version_id", 1)], "artwork_asset_version_sparse"),
        (db.orders, [("integrity_provenance.status", 1)], "order_integrity_provenance"),
        (db.audit_events, [("entity_type", 1), ("entity_id", 1), ("created_at", -1)], "audit_entity_timeline"),
        (db.financial_adjustments, [("idempotency_key", 1)], "financial_adjustment_idempotency"),
        (db.production_jobs, [("order_id", 1), ("order_item_id", 1), ("status", 1)], "production_order_status"),
    ]
    names = []
    for collection, keys, name in definitions:
        names.append(f"{collection.name}.{name}")
        if apply:
            kwargs = {"name": name}
            if name in {"artwork_asset_version_sparse", "financial_adjustment_idempotency"}:
                kwargs.update({"unique": True, "sparse": True})
            collection.create_index(keys, **kwargs)
    return names


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply additive updates; default is dry-run")
    parser.add_argument("--report", default="", help="Optional JSON report path")
    args = parser.parse_args()

    load_dotenv(BACKEND / ".env")
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    builders = {
        "products": product_updates,
        "artworks": artwork_updates,
        "orders": order_updates,
        "account_subscriptions": subscription_updates,
    }
    report: Dict[str, Any] = {
        "database": db_name,
        "mode": "apply" if args.apply else "dry_run",
        "started_at": utc_iso(),
        "financial_values_modified": False,
        "completed_payouts_modified": False,
        "uploaded_files_modified": False,
        "collections": {},
    }
    for name, builder in builders.items():
        updates = builder(db)
        report["collections"][name] = {
            "existing_records": db[name].count_documents({}),
            "candidate_updates": len(updates),
            "applied_updates": apply_updates(db[name], updates, args.apply),
        }
    report["indexes"] = ensure_indexes(db, args.apply)
    report["completed_at"] = utc_iso()
    report["report_sha256"] = stable_hash(report)
    text = json.dumps(report, indent=2, default=str)
    print(text)
    if args.report:
        Path(args.report).write_text(text + "\n")
    client.close()


if __name__ == "__main__":
    main()
