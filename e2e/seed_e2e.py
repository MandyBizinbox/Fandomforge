#!/usr/bin/env python3
"""Create isolated launch-integrity E2E fixtures.

The script refuses to run unless the database name starts with fandomforge_e2e_.
It may drop only that disposable database.
"""
from __future__ import annotations

from datetime import datetime, timezone
import os
import sys
from pathlib import Path

import bcrypt
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def hashed(value: str) -> str:
    return bcrypt.hashpw(value.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "")
    if not db_name.startswith("fandomforge_e2e_"):
        raise SystemExit("Refusing to seed a non-E2E database")
    client = MongoClient(mongo_url)
    client.drop_database(db_name)
    db = client[db_name]
    password = hashed("LaunchTest123!")

    users = [
        {"id": "owner-e2e", "email": "owner@e2e.fandomforge.test", "name": "Platform Owner", "role": "owner", "status": "active", "password_hash": password, "created_at": now()},
        {"id": "admin-e2e", "email": "admin@e2e.fandomforge.test", "name": "Admin User", "role": "admin", "status": "active", "password_hash": password, "created_at": now()},
        {"id": "manager-e2e", "email": "manager@e2e.fandomforge.test", "name": "Limited Manager", "role": "manager", "status": "active", "password_hash": password, "manager_permissions": {"manage_orders": True, "manage_reports": False, "manage_payouts": False}, "created_at": now()},
        {"id": "creator-user-e2e", "email": "creator@e2e.fandomforge.test", "name": "Creator User", "role": "creator", "status": "active", "password_hash": password, "created_at": now()},
        {"id": "creator-upgrade-user-e2e", "email": "upgrade@e2e.fandomforge.test", "name": "Upgrade Creator", "role": "creator", "status": "active", "password_hash": password, "created_at": now()},
        {"id": "printer-user-1-e2e", "email": "printer1@e2e.fandomforge.test", "name": "Printer One", "role": "printer", "status": "active", "password_hash": password, "created_at": now()},
        {"id": "printer-user-2-e2e", "email": "printer2@e2e.fandomforge.test", "name": "Printer Two", "role": "printer", "status": "active", "password_hash": password, "created_at": now()},
        {"id": "buyer-e2e", "email": "buyer@e2e.fandomforge.test", "name": "Buyer User", "role": "buyer", "status": "active", "password_hash": password, "created_at": now()},
    ]
    db.users.insert_many(users)

    creators = [
        {"id": "creator-e2e", "name": "Creator Integrity Store", "slug": "creator-integrity-store", "category": "Testing", "bio": "E2E creator", "user_id": "creator-user-e2e", "status": "active", "visibility": "public", "show_on_platform_gallery": True, "allow_search_indexing": True, "commission_rate": 0.10, "subscription_status": "active", "created_at": now()},
        {"id": "creator-upgrade-e2e", "name": "Upgrade Test Store", "slug": "upgrade-test-store", "category": "Testing", "bio": "Upgrade E2E creator", "user_id": "creator-upgrade-user-e2e", "status": "active", "visibility": "public", "show_on_platform_gallery": True, "allow_search_indexing": True, "commission_rate": 0.10, "subscription_status": "free", "created_at": now()},
    ]
    db.creators.insert_many(creators)
    db.band_members.insert_many([
        {"id": "member-creator-e2e", "band_id": "creator-e2e", "user_id": "creator-user-e2e", "role": "owner", "permissions": ["manage_products", "manage_members", "manage_store"], "status": "active", "created_at": now()},
        {"id": "member-upgrade-e2e", "band_id": "creator-upgrade-e2e", "user_id": "creator-upgrade-user-e2e", "role": "owner", "permissions": ["manage_products", "manage_members", "manage_store"], "status": "active", "created_at": now()},
    ])

    printers = [
        {"id": "printer-1-e2e", "user_id": "printer-user-1-e2e", "company_name": "Printer One E2E", "contact_email": "printer1@e2e.fandomforge.test", "phone": "", "location": "Cape Town", "capabilities": ["DTF"], "print_methods": ["dtf"], "area_tags": ["front"], "status": "active", "created_at": now()},
        {"id": "printer-2-e2e", "user_id": "printer-user-2-e2e", "company_name": "Printer Two E2E", "contact_email": "printer2@e2e.fandomforge.test", "phone": "", "location": "Cape Town", "capabilities": ["DTF"], "print_methods": ["dtf"], "area_tags": ["front"], "status": "active", "created_at": now()},
    ]
    db.printers.insert_many(printers)
    db.printer_members.insert_many([
        {"id": "printer-member-1-e2e", "printer_id": "printer-1-e2e", "user_id": "printer-user-1-e2e", "role": "owner", "permissions": [], "is_primary_owner": True, "status": "active", "created_at": now()},
        {"id": "printer-member-2-e2e", "printer_id": "printer-2-e2e", "user_id": "printer-user-2-e2e", "role": "owner", "permissions": [], "is_primary_owner": True, "status": "active", "created_at": now()},
    ])

    plans = [
        {"id": "creator-free-e2e", "name": "Creator Free E2E", "audience": "creator", "description": "E2E free plan", "monthly_price": 0, "billing_cycle": "monthly", "status": "active", "sort_order": 10, "features": ["One product"], "entitlements": {"product_publish": True, "max_products": 1, "storefront_visible": True, "checkout_enabled": True, "creator_reporting": True}, "limits": {"max_products": 1}},
        {"id": "creator-paid-e2e", "name": "Creator Paid E2E", "audience": "creator", "description": "E2E paid fixture; never published to production", "monthly_price": 99, "billing_cycle": "monthly", "status": "active", "sort_order": 20, "features": ["Ten products"], "entitlements": {"product_publish": True, "max_products": 10, "storefront_visible": True, "checkout_enabled": True, "creator_reporting": True}, "limits": {"max_products": 10}},
        {"id": "printer-free-e2e", "name": "Printer Free E2E", "audience": "printer", "description": "E2E free printer plan", "monthly_price": 0, "billing_cycle": "monthly", "status": "active", "sort_order": 10, "features": ["One job"], "entitlements": {"printer_jobs": True, "printer_job_limit": 1, "printer_pricing": True}, "limits": {"printer_job_limit": 1}},
        {"id": "printer-paid-e2e", "name": "Printer Paid E2E", "audience": "printer", "description": "E2E paid printer fixture", "monthly_price": 149, "billing_cycle": "monthly", "status": "active", "sort_order": 20, "features": ["Ten jobs"], "entitlements": {"printer_jobs": True, "printer_job_limit": 10, "printer_pricing": True, "printer_reporting": True}, "limits": {"printer_job_limit": 10}},
    ]
    db.subscription_plans.insert_many(plans)
    db.account_subscriptions.insert_many([
        {"id": "sub-creator-e2e", "owner_type": "creator", "owner_id": "creator-e2e", "plan_id": "creator-paid-e2e", "status": "active", "payment_method": "manual", "monthly_fee": 99, "created_at": now(), "updated_at": now()},
        {"id": "sub-upgrade-e2e", "owner_type": "creator", "owner_id": "creator-upgrade-e2e", "plan_id": "creator-free-e2e", "status": "free", "payment_method": "free", "monthly_fee": 0, "created_at": now(), "updated_at": now()},
        {"id": "sub-printer-1-e2e", "owner_type": "printer", "owner_id": "printer-1-e2e", "plan_id": "printer-free-e2e", "status": "free", "payment_method": "free", "monthly_fee": 0, "created_at": now(), "updated_at": now()},
        {"id": "sub-printer-2-e2e", "owner_type": "printer", "owner_id": "printer-2-e2e", "plan_id": "printer-paid-e2e", "status": "active", "payment_method": "manual", "monthly_fee": 149, "created_at": now(), "updated_at": now()},
    ])

    db.settings.insert_one({
        "id": "platform",
        "platform_name": "FandomForge E2E",
        "support_email": "help@fandomforge.co.za",
        "public_contact_email": "help@fandomforge.co.za",
        "country": "ZA",
        "currency": "ZAR",
        "default_commission_rate": 0.10,
        "default_printer_id": "printer-1-e2e",
        "modules": {
            "creators_enabled": True,
            "printers_enabled": True,
            "printer_marketplace_enabled": True,
            "product_templates_enabled": True,
            "public_shop_enabled": True,
            "wallet_enabled": True,
            "shipping_enabled": True,
            "paystack_checkout_enabled": False,
            "manual_eft_enabled": True,
            "creator_subscriptions_enabled": True,
            "printer_subscriptions_enabled": True,
        },
        "signup": {"creator_signup_enabled": True, "printer_signup_enabled": True},
        "launch_integrity": {
            "tax": {"enabled": True, "name": "VAT", "rate": 15, "prices_inclusive": False, "shipping_taxable": False, "payment_fees_taxable": False},
            "gateway_fees": {"mock": {"enabled": True, "fixed_fee": 1, "percentage_fee": 2, "absorbed_by": "platform", "refundable": False}},
            "financial_rules": {"currency": "ZAR", "shipping_refund_treatment": "proportional", "gateway_fee_refund_treatment": "non_refundable", "rounding_mode": "half_up", "calculation_version": "launch_integrity_v1"},
            "default_printer_id": "printer-1-e2e",
            "packaging_cost": 5,
        },
        "shipping_methods": {
            "e2e_flat": {"key": "e2e_flat", "adapter_key": "flat_rate", "enabled": True, "display_name": "E2E Courier", "description": "Test delivery", "method_type": "flat_rate", "sort_order": 10, "rate": 50, "zones": [], "public_config": {}, "settings": {}}
        },
    })

    db.product_types.insert_one({"id": "type-tee-e2e", "name": "E2E T-Shirt", "slug": "e2e-t-shirt", "category": "Apparel", "status": "active", "created_at": now(), "updated_at": now()})
    db.print_options.insert_one({
        "id": "print-dtf-e2e", "rule_name": "E2E DTF", "print_method": "DTF", "method_key": "dtf", "print_size": "A4", "print_cost_max": 30, "platform_print_cost": 20, "creator_print_price": 30, "print_positions": ["front"], "calculation_type": "fixed", "minimum_print_cost": 20, "status": "active", "created_at": now(), "updated_at": now()
    })
    db.product_templates.insert_one({
        "id": "template-tee-e2e", "name": "E2E Black Tee", "slug": "e2e-black-tee", "product_type_id": "type-tee-e2e", "category": "Apparel", "status": "active", "base_blank_cost": 80, "platform_blank_cost": 80, "creator_blank_price": 100, "base_price": 80, "requires_artwork": True, "available_sizes": ["M", "L"], "available_colors": ["Black"], "attribute_ids": [], "print_option_ids": ["print-dtf-e2e"], "print_areas": [{"id": "front-e2e", "name": "Front", "label": "Front", "position": "front", "allowed_print_option_ids": ["print-dtf-e2e"], "width_mm": 210, "height_mm": 297}], "variations": [{"id": "template-var-m-black-e2e", "sku": "E2E-TEE-M-BLK", "size": "M", "color": "Black", "platform_blank_cost": 80, "creator_blank_price": 100, "stock": 999, "status": "active"}], "created_at": now(), "updated_at": now()
    })
    db.printer_template_prices.insert_many([
        {"id": "printer-price-1-e2e", "printer_id": "printer-1-e2e", "product_template_id": "template-tee-e2e", "print_option_id": "print-dtf-e2e", "print_area_id": "front-e2e", "blank_price": 100, "print_price": 25, "total_price": 125, "status": "active", "created_at": now(), "updated_at": now()},
        {"id": "printer-price-2-e2e", "printer_id": "printer-2-e2e", "product_template_id": "template-tee-e2e", "print_option_id": "print-dtf-e2e", "print_area_id": "front-e2e", "blank_price": 100, "print_price": 27, "total_price": 127, "status": "active", "created_at": now(), "updated_at": now()},
    ])

    print(f"Seeded disposable E2E database: {db_name}")
    client.close()


if __name__ == "__main__":
    main()
