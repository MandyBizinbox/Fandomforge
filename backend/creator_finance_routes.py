"""Creator-facing earnings, cost and payout reporting.

This module is additive and read-only. It reports from immutable paid-order
financial snapshots and the wallet ledger without rewriting historical orders,
recalculating catalogue prices or triggering transfers.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, Depends, Query, Request

from auth import get_current_user
from models import User
import routes_main as core


creator_finance_router = APIRouter(prefix="/creator-dash", tags=["creator-finance"])


def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return float(fallback)
    return number if number == number else float(fallback)


def _money(value: Any) -> float:
    return round(_number(value), 2)


def _rate(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    number = _number(value, -1)
    if number < 0:
        return None
    if number > 1:
        number /= 100
    return max(0.0, min(number, 1.0))


def _parse_day(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _as_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _iso(value: Any) -> Optional[str]:
    parsed = _as_datetime(value)
    return parsed.isoformat() if parsed else (str(value) if value else None)


def _variation_label(item: dict) -> str:
    snapshot = item.get("production_snapshot") or {}
    variation = snapshot.get("variation") or {}
    label = variation.get("label") or variation.get("name")
    if label:
        return str(label)

    attrs = variation.get("attributes") or variation.get("attribute_values") or {}
    if attrs:
        return " / ".join(f"{key}: {value}" for key, value in attrs.items() if value not in (None, ""))

    parts = [item.get("size"), item.get("color") or item.get("colour")]
    return " / ".join(str(part) for part in parts if part) or "Standard"


def _plan_commission_rate(plan: dict) -> Optional[float]:
    limits = plan.get("limits") or {}
    candidates = [
        plan.get("commission_rate_override"),
        plan.get("commission_rate"),
        plan.get("platform_commission_rate"),
        plan.get("platform_commission_rate_percent"),
        limits.get("commission_rate_override"),
        limits.get("commission_rate"),
        limits.get("platform_commission_rate"),
        limits.get("platform_commission_rate_percent"),
    ]
    for candidate in candidates:
        parsed = _rate(candidate)
        if parsed is not None:
            return parsed
    return None


def _wallet_status(wallet_row: Optional[dict], payment_status: str) -> str:
    if wallet_row:
        return str(wallet_row.get("status") or "pending")
    return "pending_ledger" if payment_status == "paid" else "not_earned"


def _matches_status(wanted: str, actual: str) -> bool:
    return wanted in ("", "all") or wanted == actual


@creator_finance_router.get("/earnings-report")
async def creator_earnings_report(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    product_id: Optional[str] = None,
    order_number: Optional[str] = None,
    payment_status: str = Query(default="paid"),
    production_status: str = Query(default="all"),
    payout_status: str = Query(default="all"),
    user: User = Depends(get_current_user),
):
    """Return the Creator Finance workspace dataset.

    Historical amounts come from the order item snapshot and wallet transaction
    created when the order was paid. Current catalogue prices are never used to
    recalculate an old sale.
    """
    db = request.app.state.db
    creator = await core.get_creator_account_for_user(db, user, permission="view_earnings")
    creator_id = creator["id"]

    start_day = _parse_day(date_from)
    end_day = _parse_day(date_to)
    order_needle = str(order_number or "").strip().lower()

    wallet_rows = await db.wallet_transactions.find(
        {"owner_type": "creator", "owner_id": creator_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(20000)

    earnings_by_item: Dict[str, dict] = {}
    adjustments_by_item: Dict[str, float] = defaultdict(float)
    wallet_balances: Dict[str, float] = defaultdict(float)
    refund_reversal_total = 0.0

    for wallet in wallet_rows:
        status = str(wallet.get("status") or "unknown")
        amount = _number(wallet.get("amount"))
        wallet_balances[status] += amount
        transaction_type = str(wallet.get("type") or "")
        item_id = str(wallet.get("order_item_id") or "")
        if transaction_type == "creator_earning" and item_id and item_id not in earnings_by_item:
            earnings_by_item[item_id] = wallet
        elif transaction_type in {"refund", "reversal", "adjustment"} and item_id:
            adjustments_by_item[item_id] += amount
        if transaction_type in {"refund", "reversal"}:
            refund_reversal_total += amount

    orders = await db.orders.find(
        {"items.band_id": creator_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(10000)

    rows: List[dict] = []
    product_totals: Dict[str, dict] = {}
    month_totals: Dict[str, dict] = {}

    for order in orders:
        created_at = _as_datetime(order.get("created_at"))
        created_day = created_at.date() if created_at else None
        if start_day and (not created_day or created_day < start_day):
            continue
        if end_day and (not created_day or created_day > end_day):
            continue

        number = str(order.get("order_number") or "")
        if order_needle and order_needle not in number.lower():
            continue

        order_payment_status = str(order.get("payment_status") or "pending")
        if not _matches_status(payment_status, order_payment_status):
            continue

        for item in order.get("items") or []:
            if item.get("band_id") != creator_id:
                continue
            if product_id and item.get("product_id") != product_id:
                continue

            item_production_status = str(item.get("production_status") or "pending")
            if not _matches_status(production_status, item_production_status):
                continue

            item_id = str(item.get("id") or "")
            earning_wallet = earnings_by_item.get(item_id)
            item_payout_status = _wallet_status(earning_wallet, order_payment_status)
            if not _matches_status(payout_status, item_payout_status):
                continue

            quantity = max(int(_number(item.get("quantity"), 0)), 0)
            gross_sales = _money(_number(item.get("unit_price")) * quantity)
            platform_fee = _money(item.get("commission_amount"))
            creator_markup = _money(item.get("band_earnings"))
            product_cost = _money(max(gross_sales - platform_fee - creator_markup, 0))
            adjustment = _money(adjustments_by_item.get(item_id, 0))
            net_earnings = _money(creator_markup + adjustment)

            row = {
                "order_id": order.get("id"),
                "order_number": number,
                "created_at": _iso(order.get("created_at")),
                "payment_status": order_payment_status,
                "order_status": order.get("status") or "pending",
                "order_item_id": item_id,
                "product_id": item.get("product_id"),
                "product_title": item.get("product_title") or "Product",
                "variation": _variation_label(item),
                "quantity": quantity,
                "gross_sales": gross_sales,
                "product_cost": product_cost,
                "platform_fee": platform_fee,
                "platform_fee_rate": _number(item.get("commission_rate")),
                "creator_markup": creator_markup,
                "adjustment": adjustment,
                "net_earnings": net_earnings,
                "production_status": item_production_status,
                "payout_status": item_payout_status,
                "payout_batch_id": (earning_wallet or {}).get("payout_batch_id"),
                "paid_at": _iso((earning_wallet or {}).get("paid_at")),
            }
            rows.append(row)

            product_key = str(item.get("product_id") or item.get("product_title") or "unknown")
            product_bucket = product_totals.setdefault(product_key, {
                "product_id": item.get("product_id"),
                "product_title": item.get("product_title") or "Product",
                "units": 0,
                "orders": set(),
                "gross_sales": 0.0,
                "platform_fees": 0.0,
                "creator_markup": 0.0,
                "adjustments": 0.0,
                "net_earnings": 0.0,
            })
            product_bucket["units"] += quantity
            product_bucket["orders"].add(order.get("id"))
            product_bucket["gross_sales"] += gross_sales
            product_bucket["platform_fees"] += platform_fee
            product_bucket["creator_markup"] += creator_markup
            product_bucket["adjustments"] += adjustment
            product_bucket["net_earnings"] += net_earnings

            month_key = created_at.strftime("%Y-%m") if created_at else "Unknown"
            month_bucket = month_totals.setdefault(month_key, {
                "month": month_key,
                "orders": set(),
                "units": 0,
                "gross_sales": 0.0,
                "platform_fees": 0.0,
                "creator_markup": 0.0,
                "adjustments": 0.0,
                "net_earnings": 0.0,
            })
            month_bucket["orders"].add(order.get("id"))
            month_bucket["units"] += quantity
            month_bucket["gross_sales"] += gross_sales
            month_bucket["platform_fees"] += platform_fee
            month_bucket["creator_markup"] += creator_markup
            month_bucket["adjustments"] += adjustment
            month_bucket["net_earnings"] += net_earnings

    def finalise_buckets(values: Iterable[dict], *, order_key: str) -> List[dict]:
        output = []
        for bucket in values:
            row = dict(bucket)
            row["order_count"] = len(row.pop("orders", set()))
            for key in ("gross_sales", "platform_fees", "creator_markup", "adjustments", "net_earnings"):
                row[key] = _money(row.get(key))
            output.append(row)
        return sorted(output, key=lambda row: row.get(order_key) or "", reverse=True)

    by_product = finalise_buckets(product_totals.values(), order_key="gross_sales")
    by_product.sort(key=lambda row: (row.get("gross_sales", 0), row.get("units", 0)), reverse=True)
    by_month = finalise_buckets(month_totals.values(), order_key="month")

    summary = {
        "gross_sales": _money(sum(row["gross_sales"] for row in rows)),
        "product_costs": _money(sum(row["product_cost"] for row in rows)),
        "platform_fees": _money(sum(row["platform_fee"] for row in rows)),
        "creator_markup": _money(sum(row["creator_markup"] for row in rows)),
        "adjustments": _money(sum(row["adjustment"] for row in rows)),
        "net_earnings": _money(sum(row["net_earnings"] for row in rows)),
        "refunds_reversals_all_time": _money(refund_reversal_total),
        "available": _money(wallet_balances.get("available")),
        "in_batch": _money(wallet_balances.get("in_batch")),
        "paid": _money(wallet_balances.get("paid")),
        "failed": _money(wallet_balances.get("failed")),
        "record_count": len(rows),
        "unit_count": sum(row["quantity"] for row in rows),
        "order_count": len({row["order_id"] for row in rows if row.get("order_id")}),
    }

    subscription = await db.account_subscriptions.find_one(
        {"owner_id": creator_id, "owner_type": {"$in": ["creator", "band"]}},
        {"_id": 0},
        sort=[("updated_at", -1)],
    ) or {}
    current_plan = await db.subscription_plans.find_one(
        {"id": subscription.get("plan_id")},
        {"_id": 0},
    ) if subscription.get("plan_id") else None

    default_rate = await core._default_platform_commission_rate(db)
    current_rate = _rate(subscription.get("commission_rate_override"))
    if current_rate is None:
        current_rate = core._creator_platform_commission_rate(creator, default_rate)

    plan_docs = await db.subscription_plans.find(
        {"status": "active", "audience": {"$in": ["creator", "both"]}},
        {"_id": 0},
    ).sort("sort_order", 1).to_list(100)
    upgrade_options = []
    for plan in plan_docs:
        plan_rate = _plan_commission_rate(plan)
        if plan_rate is None or plan_rate >= current_rate - 0.000001:
            continue
        upgrade_options.append({
            "id": plan.get("id"),
            "name": plan.get("name") or "Creator plan",
            "description": plan.get("description") or "",
            "monthly_price": _money(plan.get("monthly_price")),
            "billing_cycle": plan.get("billing_cycle") or "monthly",
            "commission_rate": round(plan_rate, 6),
            "commission_percent": round(plan_rate * 100, 4),
            "estimated_period_savings": _money(summary["gross_sales"] * (current_rate - plan_rate)),
        })

    products = await db.products.find(
        {"band_id": creator_id},
        {"_id": 0, "id": 1, "title": 1},
    ).sort("title", 1).to_list(1000)

    batches = await db.payout_batches.find(
        {"items.owner_type": "creator", "items.owner_id": creator_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    payout_history = []
    for batch in batches:
        for item in batch.get("items") or []:
            if item.get("owner_id") != creator_id:
                continue
            payout_history.append({
                "batch_id": batch.get("id"),
                "title": batch.get("title"),
                "scheduled_for": batch.get("scheduled_for"),
                "amount": _money(item.get("amount")),
                "status": item.get("status") or batch.get("status") or "pending",
                "reference": item.get("provider_reference"),
                "failure_reason": item.get("failure_reason"),
                "paid_at": _iso(item.get("paid_at")),
            })

    payout_profile = await db.payout_profiles.find_one(
        {"owner_type": "creator", "owner_id": creator_id, "is_default": True},
        {"_id": 0},
    ) or await db.payout_profiles.find_one(
        {"owner_type": "creator", "owner_id": creator_id},
        {"_id": 0},
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "currency": "ZAR",
        "creator": {"id": creator_id, "name": creator.get("name") or creator.get("slug") or "Creator"},
        "filters": {
            "date_from": date_from,
            "date_to": date_to,
            "product_id": product_id,
            "order_number": order_number,
            "payment_status": payment_status,
            "production_status": production_status,
            "payout_status": payout_status,
        },
        "summary": summary,
        "rows": rows,
        "by_product": by_product,
        "by_month": by_month,
        "products": [{"id": row.get("id"), "title": row.get("title") or "Product"} for row in products],
        "current_plan": {
            "id": subscription.get("plan_id"),
            "name": (current_plan or {}).get("name") or subscription.get("paystack_plan_name") or creator.get("monthly_package_name") or "Current creator plan",
            "status": subscription.get("status") or creator.get("subscription_status") or "manual",
            "monthly_price": _money(subscription.get("monthly_fee", (current_plan or {}).get("monthly_price", 0))),
            "commission_rate": round(current_rate, 6),
            "commission_percent": round(current_rate * 100, 4),
            "commission_source": creator.get("platform_commission_source") or ("subscription_override" if subscription.get("commission_rate_override") is not None else "default"),
        },
        "upgrade_options": upgrade_options,
        "payout": {
            "day": "Friday",
            "ready": bool(
                payout_profile
                and payout_profile.get("verification_status") == "verified"
                and payout_profile.get("paystack_recipient_code")
            ),
            "profile_status": (payout_profile or {}).get("verification_status") or "not_configured",
            "history": payout_history,
        },
    }
