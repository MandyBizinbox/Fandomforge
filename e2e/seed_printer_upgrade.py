#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
import os

import bcrypt
from pymongo import MongoClient


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    db_name = os.environ.get("DB_NAME", "")
    if not db_name.startswith("fandomforge_e2e_"):
        raise SystemExit("Refusing to seed a non-E2E database")
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[db_name]
    password = bcrypt.hashpw(b"LaunchTest123!", bcrypt.gensalt()).decode()
    db.users.update_one(
        {"id": "printer-user-3-e2e"},
        {"$setOnInsert": {
            "id": "printer-user-3-e2e",
            "email": "printer3@e2e.fandomforge.test",
            "name": "Printer Three",
            "role": "printer",
            "status": "active",
            "password_hash": password,
            "created_at": now(),
        }},
        upsert=True,
    )
    db.printers.update_one(
        {"id": "printer-3-e2e"},
        {"$setOnInsert": {
            "id": "printer-3-e2e",
            "user_id": "printer-user-3-e2e",
            "company_name": "Printer Three E2E",
            "contact_email": "printer3@e2e.fandomforge.test",
            "phone": "",
            "location": "Cape Town",
            "capabilities": ["DTF"],
            "print_methods": ["dtf"],
            "area_tags": ["front"],
            "status": "active",
            "created_at": now(),
        }},
        upsert=True,
    )
    db.printer_members.update_one(
        {"id": "printer-member-3-e2e"},
        {"$setOnInsert": {
            "id": "printer-member-3-e2e",
            "printer_id": "printer-3-e2e",
            "user_id": "printer-user-3-e2e",
            "role": "owner",
            "permissions": [],
            "is_primary_owner": True,
            "status": "active",
            "created_at": now(),
        }},
        upsert=True,
    )
    db.account_subscriptions.update_one(
        {"id": "sub-printer-3-e2e"},
        {"$setOnInsert": {
            "id": "sub-printer-3-e2e",
            "owner_type": "printer",
            "owner_id": "printer-3-e2e",
            "plan_id": "printer-free-e2e",
            "status": "free",
            "payment_method": "free",
            "monthly_fee": 0,
            "created_at": now(),
            "updated_at": now(),
        }},
        upsert=True,
    )
    immutable = {
        "currency": "ZAR",
        "subtotal": 250,
        "creator_earnings": 80,
        "printer_liability": 125,
        "platform_gross_revenue": 45,
        "platform_commission_amount": 25,
        "platform_commission_rate": 0.10,
        "tax_amount": 0,
        "payment_fee_allocation": 0,
        "shipping_allocation": 0,
        "refundable_balance": 250,
        "already_refunded_amount": 0,
        "refunded_quantity": 0,
    }
    base_item = {
        "product_id": "product-printer-limit-e2e",
        "product_title": "Printer Limit Fixture",
        "band_id": "creator-e2e",
        "creator_id": "creator-e2e",
        "printer_id": "printer-3-e2e",
        "quantity": 1,
        "unit_price": 250,
        "size": "M",
        "color": "Black",
        "variation_id": "template-var-m-black-e2e",
        "financial_snapshot": immutable,
        "production_snapshot": {
            "creator_id": "creator-e2e",
            "store_id": "creator-e2e",
            "product_id": "product-printer-limit-e2e",
            "product_version": 1,
            "template_id": "template-tee-e2e",
            "template_version": "e2e-v1",
            "artwork_asset_versions": [],
            "text_layers": [],
            "production_operations": [],
            "commercial_snapshot": immutable,
            "snapshot_sha256": "printer-limit-immutable",
            "immutable": True,
        },
    }
    for suffix in ["pending-1", "pending-2"]:
        item = {**base_item, "id": f"printer-limit-{suffix}-item"}
        db.orders.update_one(
            {"id": f"printer-limit-{suffix}"},
            {"$setOnInsert": {
                "id": f"printer-limit-{suffix}",
                "order_number": f"PRINTER-LIMIT-{suffix.upper()}",
                "payment_status": "paid",
                "status": "sent_to_printer",
                "subtotal": 250,
                "shipping_total": 0,
                "total": 250,
                "items": [item],
                "created_at": now(),
                "updated_at": now(),
            }},
            upsert=True,
        )
    db.production_jobs.update_one(
        {"id": "printer-limit-existing-job"},
        {"$setOnInsert": {
            "id": "printer-limit-existing-job",
            "idempotency_key": "production-job:printer-limit-existing:printer-limit-existing-item",
            "order_id": "printer-limit-existing",
            "order_number": "PRINTER-LIMIT-EXISTING",
            "order_item_id": "printer-limit-existing-item",
            "printer_id": "printer-3-e2e",
            "original_printer_id": "printer-3-e2e",
            "creator_id": "creator-e2e",
            "status": "accepted",
            "acceptance_status": "accepted",
            "production": {**base_item["production_snapshot"], "immutable_order_snapshot": True},
            "reprint_of_job_id": None,
            "reprint_of_order_item_id": None,
            "created_at": now(),
            "updated_at": now(),
        }},
        upsert=True,
    )
    print("Seeded independent Printer upgrade fixture")
    client.close()


if __name__ == "__main__":
    main()
