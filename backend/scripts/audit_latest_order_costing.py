"""Audit the latest order's product costing, commission and creator payout values.

Run from /var/www/sites/fandomforge/backend:
    ./venv/bin/python scripts/audit_latest_order_costing.py

This is read-only. It does not modify orders, products, payouts or wallet records.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient


load_dotenv(Path(__file__).resolve().parents[1] / ".env")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def money(value):
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0


def find_variation(product, variation_id):
    for variation in product.get("variations") or []:
        if str(variation.get("id")) == str(variation_id) or str(variation.get("template_variation_id")) == str(variation_id):
            return variation
    return None


def order_value_shape(label, stored, expected_unit, qty):
    expected_total = money(expected_unit * qty)
    stored_value = money(stored)

    unit_match = abs(stored_value - money(expected_unit)) <= 0.02
    total_match = abs(stored_value - expected_total) <= 0.02

    if unit_match:
        status = "UNIT_MATCH"
    elif total_match:
        status = "TOTAL_MATCH"
    else:
        status = "MISMATCH"

    return {
        "label": label,
        "stored": stored_value,
        "expected_unit": money(expected_unit),
        "expected_total": expected_total,
        "status": status,
    }


def creator_safe_money_view(order):
    """Return the commercial numbers a creator may see.

    Creators may see production cost, creator markup, platform fee, selling prices,
    total markup on order and total payout for order. They must not see printer
    payout, supplier cost, platform internal margin, or printer margin.
    """
    rows = []
    totals = {
        "selling_total": 0.0,
        "production_cost_total": 0.0,
        "platform_fee_total": 0.0,
        "creator_markup_total": 0.0,
        "creator_payout_total": 0.0,
    }

    for item in order.get("items") or []:
        qty = int(item.get("quantity") or 1)
        unit_price = money(item.get("unit_price"))
        platform_fee_unit = money(item.get("commission_amount"))
        creator_markup_unit = money(item.get("band_earnings"))
        production_cost_unit = money(unit_price - platform_fee_unit - creator_markup_unit)

        row = {
            "product_title": item.get("product_title"),
            "variation_id": item.get("variation_id"),
            "quantity": qty,
            "selling_price_unit": unit_price,
            "production_cost_unit": production_cost_unit,
            "platform_fee_unit": platform_fee_unit,
            "creator_markup_unit": creator_markup_unit,
            "selling_price_total": money(unit_price * qty),
            "production_cost_total": money(production_cost_unit * qty),
            "platform_fee_total": money(platform_fee_unit * qty),
            "creator_markup_total": money(creator_markup_unit * qty),
        }
        row["creator_payout_total"] = row["creator_markup_total"]
        rows.append(row)

        totals["selling_total"] += row["selling_price_total"]
        totals["production_cost_total"] += row["production_cost_total"]
        totals["platform_fee_total"] += row["platform_fee_total"]
        totals["creator_markup_total"] += row["creator_markup_total"]
        totals["creator_payout_total"] += row["creator_payout_total"]

    return {
        "order_number": order.get("order_number"),
        "rows": rows,
        "totals": {key: money(value) for key, value in totals.items()},
        "hidden_from_creator": [
            "printer_payout",
            "printer_payout_total",
            "supplier_cost",
            "platform_internal_profit",
            "platform_blank_profit",
            "platform_print_profit",
            "printer_margin",
        ],
    }


order = db.orders.find_one(sort=[("created_at", -1)], projection={"_id": 0})
if not order:
    raise SystemExit("No orders found")

print("\nLATEST ORDER")
print(json.dumps({
    "id": order.get("id"),
    "order_number": order.get("order_number"),
    "buyer_email": order.get("buyer_email"),
    "status": order.get("status"),
    "payment_status": order.get("payment_status"),
    "payment_provider": order.get("payment_provider"),
    "subtotal": order.get("subtotal"),
    "shipping_total": order.get("shipping_total"),
    "total": order.get("total"),
    "created_at": str(order.get("created_at")),
}, indent=2, default=str))

items = order.get("items") or []
calc_subtotal = 0
calc_creator_earnings = 0
calc_commission = 0
calc_printer_payout = 0

for index, item in enumerate(items, start=1):
    product = db.products.find_one({"id": item.get("product_id")}, {"_id": 0}) or {}
    variation = find_variation(product, item.get("variation_id")) or {}

    qty = int(item.get("quantity") or 1)

    expected_unit_price = money(
        variation.get("effective_selling_price")
        or variation.get("price_override")
        or product.get("effective_selling_price")
        or product.get("customer_selling_price")
        or product.get("selling_price")
        or item.get("unit_price")
    )

    expected_creator_product_cost_unit = money(
        variation.get("creator_product_cost")
        or product.get("creator_product_cost")
        or product.get("estimated_total_cost")
        or (
            money(product.get("creator_blank_price") or product.get("estimated_blank_cost"))
            + money(product.get("creator_print_price") or product.get("estimated_print_cost"))
        )
    )

    commission_rate = money(item.get("commission_rate") if item.get("commission_rate") is not None else product.get("commission_rate"))
    if commission_rate > 1:
        commission_rate = commission_rate / 100

    expected_commission_unit = money(expected_unit_price * commission_rate)
    expected_creator_earnings_unit = money(expected_unit_price - expected_creator_product_cost_unit - expected_commission_unit)
    expected_printer_payout_unit = money(
        product.get("creator_product_cost")
        or product.get("estimated_total_cost")
        or expected_creator_product_cost_unit
    )

    calc_subtotal += expected_unit_price * qty
    calc_creator_earnings += expected_creator_earnings_unit * qty
    calc_commission += expected_commission_unit * qty
    calc_printer_payout += expected_printer_payout_unit * qty

    snapshot = item.get("production_snapshot") or {}
    breakdown = snapshot.get("costing_breakdown") or product.get("costing_breakdown") or {}

    checks = [
        order_value_shape("unit_price", item.get("unit_price"), expected_unit_price, qty),
        order_value_shape("print_cost_unit / creator production cost", item.get("print_cost_unit"), expected_creator_product_cost_unit, qty),
        order_value_shape("commission_amount", item.get("commission_amount"), expected_commission_unit, qty),
        order_value_shape("band_earnings / creator payout", item.get("band_earnings"), expected_creator_earnings_unit, qty),
        order_value_shape("printer_payout", item.get("printer_payout"), expected_printer_payout_unit, qty),
    ]

    print("\nORDER ITEM", index)
    print(json.dumps({
        "product_id": item.get("product_id"),
        "product_title": item.get("product_title"),
        "variation_id": item.get("variation_id"),
        "quantity": qty,
        "stored": {
            "unit_price": item.get("unit_price"),
            "print_cost_unit": item.get("print_cost_unit"),
            "commission_rate": item.get("commission_rate"),
            "commission_amount": item.get("commission_amount"),
            "band_earnings": item.get("band_earnings"),
            "printer_payout": item.get("printer_payout"),
        },
        "product_current_costing": {
            "selling_price": product.get("selling_price"),
            "customer_selling_price": product.get("customer_selling_price"),
            "effective_selling_price": product.get("effective_selling_price"),
            "creator_blank_price": product.get("creator_blank_price"),
            "creator_print_price": product.get("creator_print_price"),
            "creator_product_cost": product.get("creator_product_cost"),
            "estimated_total_cost": product.get("estimated_total_cost"),
            "commission_rate": product.get("commission_rate"),
            "estimated_commission": product.get("estimated_commission"),
            "estimated_creator_profit": product.get("estimated_creator_profit"),
            "platform_production_operation_cost": product.get("platform_production_operation_cost"),
            "production_operation_cost": product.get("production_operation_cost"),
        },
        "variation_current_costing": {
            "id": variation.get("id"),
            "template_variation_id": variation.get("template_variation_id"),
            "price_override": variation.get("price_override"),
            "effective_selling_price": variation.get("effective_selling_price"),
            "effective_creator_amount": variation.get("effective_creator_amount"),
        },
        "production_snapshot": {
            "production_cost": snapshot.get("production_cost"),
            "printer_payout": snapshot.get("printer_payout"),
            "creator_profit": snapshot.get("creator_profit"),
            "platform_commission": snapshot.get("platform_commission"),
            "costing_model": snapshot.get("costing_model"),
            "has_costing_breakdown": bool(breakdown),
            "production_operation_platform_cost": breakdown.get("production_operation_platform_cost"),
            "production_operation_creator_price": breakdown.get("production_operation_creator_price"),
        },
        "expected_unit_values": {
            "unit_price": expected_unit_price,
            "creator_product_cost": expected_creator_product_cost_unit,
            "commission": expected_commission_unit,
            "creator_earnings": expected_creator_earnings_unit,
            "printer_payout": expected_printer_payout_unit,
        },
        "checks": checks,
    }, indent=2, default=str))

print("\nORDER TOTAL CHECK")
print(json.dumps({
    "stored_subtotal": money(order.get("subtotal")),
    "expected_subtotal_from_items": money(calc_subtotal),
    "stored_total": money(order.get("total")),
    "expected_total_subtotal_plus_shipping": money(calc_subtotal + money(order.get("shipping_total"))),
    "expected_creator_earnings_total": money(calc_creator_earnings),
    "expected_commission_total": money(calc_commission),
    "expected_printer_payout_total": money(calc_printer_payout),
}, indent=2, default=str))

print("\nCREATOR-SAFE MONEY VIEW")
print(json.dumps(creator_safe_money_view(order), indent=2, default=str))

print("\nRELATED PAYOUT/WALLET RECORDS")
order_id = order.get("id")
order_number = order.get("order_number")
for collection in ["payouts", "payout_batches", "wallet_transactions", "commissions"]:
    count = db[collection].count_documents({
        "$or": [
            {"order_id": order_id},
            {"order_number": order_number},
        ]
    })
    print(collection + ":", count)

print("\nDONE")
