#!/usr/bin/env python3
"""Read-only FandomForge launch-integrity and reconciliation report."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def grouped_count(collection, field: str) -> Dict[str, int]:
    return {
        str(row.get("_id") or "unknown"): int(row.get("count") or 0)
        for row in collection.aggregate([
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ])
    }


def grouped_amount(collection, match: Dict[str, Any], group_fields: Dict[str, str]) -> list[Dict[str, Any]]:
    group_id = {key: f"${value}" for key, value in group_fields.items()}
    return list(collection.aggregate([
        {"$match": match},
        {"$group": {"_id": group_id, "amount": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        {"$sort": {"_id.order_id": 1}},
    ]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--label", default="integrity")
    args = parser.parse_args()

    load_dotenv(BACKEND / ".env")
    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    collections = [
        "users", "creators", "printers", "products", "artworks", "orders", "payments",
        "commissions", "payouts", "wallet_transactions", "financial_adjustments",
        "payout_profiles", "payout_batches", "subscription_plans", "account_subscriptions",
        "entitlement_overrides", "entitlement_usage", "production_jobs", "production_exceptions",
        "audit_events", "notifications", "notification_emails", "contact_messages", "settings_history",
    ]
    counts = {name: db[name].count_documents({}) for name in collections}
    platform = db.settings.find_one({"id": "platform"}, {"_id": 0}) or {}

    duplicate_wallet_keys = list(db.wallet_transactions.aggregate([
        {"$match": {"idempotency_key": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$idempotency_key", "count": {"$sum": 1}, "ids": {"$addToSet": "$id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 200},
    ]))
    duplicate_adjustment_keys = list(db.financial_adjustments.aggregate([
        {"$match": {"idempotency_key": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$idempotency_key", "count": {"$sum": 1}, "ids": {"$addToSet": "$id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 200},
    ]))
    duplicate_payout_references = list(db.payout_batches.aggregate([
        {"$unwind": "$items"},
        {"$match": {"items.provider_reference": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$items.provider_reference", "count": {"$sum": 1}, "batches": {"$addToSet": "$id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 200},
    ]))
    duplicate_batch_membership = list(db.payout_batches.aggregate([
        {"$unwind": "$items"},
        {"$unwind": "$items.wallet_transaction_ids"},
        {"$group": {"_id": "$items.wallet_transaction_ids", "count": {"$sum": 1}, "batches": {"$addToSet": "$id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 200},
    ]))

    orders_with_integrity = db.orders.count_documents({"financial_snapshot.snapshot_contract_version": "order_finance_v1"})
    order_items_with_integrity = list(db.orders.aggregate([
        {"$unwind": "$items"},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "financial_snapshot": {"$sum": {"$cond": [{"$ifNull": ["$items.financial_snapshot.allocation_sha256", False]}, 1, 0]}},
            "immutable_production": {"$sum": {"$cond": [{"$eq": ["$items.production_snapshot.immutable", True]}, 1, 0]}},
            "legacy_unallocated": {"$sum": {"$cond": [{"$eq": ["$items.financial_snapshot_availability.status", "legacy_unallocated"]}, 1, 0]}},
        }},
    ]))
    order_item_summary = order_items_with_integrity[0] if order_items_with_integrity else {
        "total": 0, "financial_snapshot": 0, "immutable_production": 0, "legacy_unallocated": 0,
    }
    order_item_summary.pop("_id", None)

    verified_creator_profiles = db.payout_profiles.count_documents({
        "owner_type": "creator", "provider": "paystack", "verification_status": "verified",
        "paystack_recipient_code": {"$nin": [None, ""]},
    })
    invalid_verified_profiles = db.payout_profiles.count_documents({
        "verification_status": "verified",
        "$or": [
            {"paystack_recipient_code": None},
            {"paystack_recipient_code": ""},
            {"paystack_recipient_code": {"$exists": False}},
        ],
    })

    wallet_owner_balances = list(db.wallet_transactions.aggregate([
        {"$match": {"owner_type": {"$in": ["creator", "printer"]}, "status": {"$in": ["available", "in_batch", "paid"]}}},
        {"$group": {"_id": {"owner_type": "$owner_type", "owner_id": "$owner_id", "status": "$status"}, "amount": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        {"$sort": {"_id.owner_type": 1, "_id.owner_id": 1, "_id.status": 1}},
    ]))
    negative_available_balances = []
    totals: Dict[tuple[str, str], float] = defaultdict(float)
    for row in wallet_owner_balances:
        key = (row["_id"].get("owner_type"), row["_id"].get("owner_id"))
        if row["_id"].get("status") == "available":
            totals[key] += float(row.get("amount") or 0)
    for (owner_type, owner_id), amount in totals.items():
        if amount < -0.001:
            negative_available_balances.append({"owner_type": owner_type, "owner_id": owner_id, "amount": round(amount, 2)})

    report = {
        "label": args.label,
        "generated_at": utc_iso(),
        "database": os.environ["DB_NAME"],
        "read_only": True,
        "counts": counts,
        "platform": {
            "package_key": platform.get("package_key"),
            "support_email": platform.get("support_email"),
            "public_contact_email": platform.get("public_contact_email"),
            "modules": platform.get("modules") or {},
            "tax": (platform.get("launch_integrity") or {}).get("tax") or {},
            "financial_rules": (platform.get("launch_integrity") or {}).get("financial_rules") or {},
            "paystack_enabled": bool(platform.get("paystack_enabled")),
            "paystack_mode": platform.get("paystack_mode"),
            "paystack_public_key_configured": bool(platform.get("paystack_public_key")),
            "paystack_secret_key_configured": bool(platform.get("paystack_secret_key")),
        },
        "status_counts": {
            "orders": grouped_count(db.orders, "status"),
            "payments": grouped_count(db.payments, "status"),
            "wallet": grouped_count(db.wallet_transactions, "status"),
            "payout_batches": grouped_count(db.payout_batches, "status"),
            "subscriptions": grouped_count(db.account_subscriptions, "status"),
            "production_jobs": grouped_count(db.production_jobs, "status"),
            "email_delivery": grouped_count(db.notification_emails, "status"),
        },
        "order_integrity": {
            "orders_with_order_finance_v1": orders_with_integrity,
            "items": order_item_summary,
            "historic_orders_preserved": db.orders.count_documents({"integrity_provenance.status": "legacy_preserved"}),
        },
        "payout_integrity": {
            "verified_creator_paystack_profiles": verified_creator_profiles,
            "invalid_verified_profiles": invalid_verified_profiles,
            "duplicate_provider_references": duplicate_payout_references,
            "duplicate_wallet_membership": duplicate_batch_membership,
        },
        "financial_integrity": {
            "duplicate_wallet_idempotency_keys": duplicate_wallet_keys,
            "duplicate_adjustment_idempotency_keys": duplicate_adjustment_keys,
            "negative_available_balances": negative_available_balances,
            "wallet_owner_balances": wallet_owner_balances,
            "financial_events_by_order": grouped_amount(
                db.wallet_transactions,
                {"order_id": {"$nin": [None, ""]}},
                {"order_id": "order_id", "event_type": "event_type", "status": "status"},
            ),
        },
        "indexes": {
            name: sorted(db[name].index_information().keys())
            for name in [
                "wallet_transactions", "financial_adjustments", "payout_profiles", "payout_batches",
                "account_subscriptions", "entitlement_overrides", "production_jobs", "audit_events",
                "notification_emails",
            ]
        },
    }
    report["report_sha256"] = stable(report)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(json.dumps(report, indent=2, default=str))
    client.close()


if __name__ == "__main__":
    main()
