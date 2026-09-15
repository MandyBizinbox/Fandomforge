#!/usr/bin/env python3
"""Read-only exact-SHA release audit for FandomForge financial integrity.

The audit never writes to MongoDB. Financial duplicate classes fail the command.
Proposed legacy artwork-version collisions are reported separately because the
launch deployment runs the provenance backfill in dry-run mode only.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable

from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def duplicates(collection, field: str, *, unwind: Iterable[str] = ()) -> list[Dict[str, Any]]:
    pipeline: list[Dict[str, Any]] = []
    for path in unwind:
        pipeline.append({"$unwind": f"${path}"})
    pipeline.extend([
        {"$match": {field: {"$nin": [None, ""]}}},
        {"$group": {"_id": f"${field}", "count": {"$sum": 1}, "document_ids": {"$addToSet": "$id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
        {"$limit": 500},
    ])
    return list(collection.aggregate(pipeline))


def proposed_artwork_version(row: Dict[str, Any]) -> tuple[str, str, str]:
    url = str(
        row.get("immutable_asset_url")
        or row.get("file_url")
        or row.get("original_url")
        or row.get("url")
        or ""
    )
    digest = str(row.get("content_sha256") or "")
    provenance = str(row.get("hash_provenance") or "")
    if not digest:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        provenance = "legacy_url_reference"
    version_id = str(row.get("asset_version_id") or f"asset-{digest[:24]}")
    return version_id, digest, provenance


def artwork_collisions(db) -> list[Dict[str, Any]]:
    grouped: Dict[str, list[Dict[str, Any]]] = defaultdict(list)
    for row in db.artworks.find({}, {"_id": 0}):
        version_id, digest, provenance = proposed_artwork_version(row)
        grouped[version_id].append({
            "artwork_id": row.get("id"),
            "product_id": row.get("product_id"),
            "asset_version_id": version_id,
            "content_sha256": digest,
            "hash_provenance": provenance,
            "asset_url": row.get("immutable_asset_url") or row.get("file_url") or row.get("original_url") or row.get("url"),
        })
    return [
        {
            "asset_version_id": version_id,
            "count": len(rows),
            "distinct_artwork_ids": sorted({str(row.get("artwork_id")) for row in rows}),
            "distinct_asset_urls": sorted({str(row.get("asset_url")) for row in rows}),
            "records": rows,
            "unsafe_for_unique_index_or_write_backfill": True,
        }
        for version_id, rows in sorted(grouped.items())
        if len(rows) > 1
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--candidate-sha", default=os.environ.get("CANDIDATE_SHA", "unknown"))
    args = parser.parse_args()

    load_dotenv(BACKEND / ".env")
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    result = {
        "candidate_sha": args.candidate_sha,
        "generated_at": utc_iso(),
        "database": db_name,
        "read_only": True,
        "financial_duplicates": {
            "wallet_event_keys": duplicates(db.wallet_transactions, "idempotency_key"),
            "adjustment_keys": duplicates(db.financial_adjustments, "idempotency_key"),
            "payout_batch_keys": duplicates(db.payout_batches, "batch_key"),
            "payout_batch_ids": duplicates(db.payout_batches, "id"),
            "provider_transfer_references": duplicates(
                db.payout_batches,
                "items.provider_reference",
                unwind=("items",),
            ),
            "provider_transfer_codes": duplicates(
                db.payout_batches,
                "items.provider_transfer_code",
                unwind=("items",),
            ),
        },
        "artwork_version_collisions": artwork_collisions(db),
        "backfill_mode_authorised": "dry_run_only",
    }
    financial_failures = {
        key: rows for key, rows in result["financial_duplicates"].items() if rows
    }
    result["financial_duplicate_gate_passed"] = not bool(financial_failures)
    result["artwork_write_backfill_safe"] = not bool(result["artwork_version_collisions"])
    result["report_sha256"] = stable_hash(result)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, default=str) + "\n")
    print(json.dumps(result, indent=2, default=str))
    client.close()

    if financial_failures:
        raise SystemExit(f"Financial duplicate release gate failed: {sorted(financial_failures)}")


if __name__ == "__main__":
    main()
