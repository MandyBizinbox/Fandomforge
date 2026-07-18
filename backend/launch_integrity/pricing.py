"""Authoritative backend product pricing and immutable order allocations."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

from .settings import (
    estimate_gateway_fee,
    gateway_fee_snapshot,
    resolve_platform_settings,
    tax_snapshot,
)

PRICING_VERSION = "pricing_v1"
CENT = Decimal("0.01")


def D(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def money(value: Any) -> Decimal:
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def fmoney(value: Any) -> float:
    return float(money(value))


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def marked_price(platform_cost: Decimal, explicit: Any = None, markup_type: str = "manual", markup_value: Any = 0) -> Decimal:
    if explicit not in (None, "") and D(explicit) > 0:
        return money(explicit)
    value = D(markup_value)
    if markup_type == "percentage" and value:
        return money(platform_cost * (Decimal("1") + value / Decimal("100")))
    if markup_type == "fixed_amount" and value:
        return money(platform_cost + value)
    return money(platform_cost * Decimal("1.10"))


def _variation(product: Dict[str, Any], variation_id: Optional[str]) -> Dict[str, Any]:
    rows = product.get("variations") or []
    return next((row for row in rows if str(row.get("id")) == str(variation_id)), rows[0] if rows else {})


def _template_variation(template: Dict[str, Any], product_variation: Dict[str, Any]) -> Dict[str, Any]:
    rows = template.get("variations") or []
    keys = [product_variation.get("template_variation_id"), product_variation.get("id")]
    return next((row for row in rows if row.get("id") in keys), {})


def _blank_costs(product: Dict[str, Any], template: Dict[str, Any], variation: Dict[str, Any]) -> Tuple[Decimal, Decimal, Dict[str, Any]]:
    tvar = _template_variation(template, variation)
    platform_cost = D(
        tvar.get("platform_blank_cost") or tvar.get("base_blank_cost") or tvar.get("cost")
        or variation.get("platform_blank_cost") or variation.get("base_blank_cost") or variation.get("cost")
        or template.get("platform_blank_cost") or template.get("base_blank_cost") or template.get("base_price")
        or product.get("platform_blank_cost") or 0
    )
    explicit = (
        tvar.get("creator_blank_price") or variation.get("creator_blank_price")
        or template.get("creator_blank_price") or product.get("creator_blank_price")
    )
    creator_price = marked_price(
        platform_cost,
        explicit,
        tvar.get("platform_blank_markup_type") or template.get("platform_blank_markup_type") or "manual",
        tvar.get("platform_blank_markup_value") or template.get("platform_blank_markup_value") or 0,
    )
    source = {
        "template_id": template.get("id"),
        "template_version": template.get("version") or template.get("updated_at") or "legacy-unversioned",
        "template_variation_id": tvar.get("id") or variation.get("template_variation_id"),
    }
    return money(platform_cost), money(creator_price), source


def _slot_area_cm2(slot: Dict[str, Any]) -> Decimal:
    existing = D(slot.get("charged_area_cm2") or slot.get("area_cm2"))
    if existing > 0:
        return existing
    width = D(slot.get("charged_width_mm") or slot.get("print_width_mm") or slot.get("width_mm") or slot.get("placement_box_width_mm"))
    height = D(slot.get("charged_height_mm") or slot.get("print_height_mm") or slot.get("height_mm") or slot.get("placement_box_height_mm"))
    return width * height / Decimal("100") if width > 0 and height > 0 else Decimal("0")


def _global_print_cost(option: Dict[str, Any], slot: Dict[str, Any]) -> Decimal:
    calculation = option.get("calculation_type") or "fixed"
    area = _slot_area_cm2(slot)
    if calculation == "area_fixed_rate":
        cost = area * D(option.get("cost_per_cm2"))
    elif calculation in {"area_from_sheet", "sheet", "full_sheet"}:
        sheet_w = D(option.get("sheet_width_mm"))
        sheet_h = D(option.get("sheet_height_mm"))
        sheet_cost = D(option.get("sheet_cost"))
        sheet_area = sheet_w * sheet_h / Decimal("100") if sheet_w and sheet_h else Decimal("0")
        cost = sheet_cost if calculation in {"sheet", "full_sheet"} else (area / sheet_area * sheet_cost if sheet_area else Decimal("0"))
    else:
        cost = D(option.get("platform_print_cost") or option.get("print_cost_max"))
    if D(option.get("waste_percentage")):
        cost *= Decimal("1") + D(option.get("waste_percentage")) / Decimal("100")
    if D(option.get("markup_percentage")):
        cost *= Decimal("1") + D(option.get("markup_percentage")) / Decimal("100")
    if D(option.get("minimum_print_cost")):
        cost = max(cost, D(option.get("minimum_print_cost")))
    return money(cost)


def _artwork_rows(product: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen = set()
    for group in product.get("artwork_groups") or []:
        for slot in group.get("artworks") or []:
            key = slot.get("id") or f"{slot.get('print_area_id')}:{slot.get('print_option_id')}:{slot.get('original_url')}"
            if key not in seen:
                rows.append(slot)
                seen.add(key)
    for slot in product.get("artworks") or []:
        key = slot.get("id") or f"{slot.get('print_area_id')}:{slot.get('print_option_id')}:{slot.get('original_url')}"
        if key not in seen:
            rows.append(slot)
            seen.add(key)
    return rows


async def _print_costs(db, product: Dict[str, Any]) -> Tuple[Decimal, Decimal, List[Dict[str, Any]]]:
    slots = [row for row in _artwork_rows(product) if row.get("print_option_id")]
    option_ids = sorted({row.get("print_option_id") for row in slots if row.get("print_option_id")})
    globals_ = await db.print_options.find({"id": {"$in": option_ids}, "status": {"$ne": "archived"}}, {"_id": 0}).to_list(500) if option_ids else []
    option_map = {str(row.get("id")): row for row in globals_}
    platform_total = Decimal("0")
    creator_total = Decimal("0")
    sources: List[Dict[str, Any]] = []
    for slot in slots:
        option = option_map.get(str(slot.get("print_option_id")))
        if option:
            platform_cost = _global_print_cost(option, slot)
            creator_price = marked_price(
                platform_cost,
                option.get("creator_print_price"),
                option.get("platform_print_markup_type") or "manual",
                option.get("platform_print_markup_value") or 0,
            )
            source_type = "global_print_option"
        else:
            platform_cost = money(slot.get("platform_print_cost") or slot.get("raw_print_cost") or slot.get("calculated_print_cost"))
            creator_price = money(slot.get("creator_print_price") or platform_cost)
            source_type = "legacy_snapshot_fallback"
        platform_total += platform_cost
        creator_total += creator_price
        sources.append({
            "print_option_id": slot.get("print_option_id"),
            "print_option_version": (option or {}).get("version") or (option or {}).get("updated_at") or "legacy-unversioned",
            "source": source_type,
            "platform_cost": fmoney(platform_cost),
            "creator_price": fmoney(creator_price),
            "print_area_id": slot.get("print_area_id"),
        })
    if not slots:
        platform_total = money(product.get("platform_print_cost"))
        creator_total = money(product.get("creator_print_price") or product.get("print_cost"))
    return money(platform_total), money(creator_total), sources


def _operation_costs(product: Dict[str, Any]) -> Tuple[Decimal, Decimal, List[Dict[str, Any]]]:
    lines = deepcopy(product.get("production_operation_lines") or [])
    platform = money(sum(D(row.get("platform_cost")) for row in lines))
    explicit_creator = product.get("production_operation_cost")
    creator = money(explicit_creator) if explicit_creator not in (None, "") else marked_price(platform)
    return platform, creator, lines


async def _printer_liability(db, product: Dict[str, Any], printer_id: Optional[str], creator_cost: Decimal) -> Tuple[Decimal, Dict[str, Any]]:
    if printer_id:
        query = {"printer_id": printer_id, "status": {"$ne": "archived"}}
        if product.get("template_id"):
            query["product_template_id"] = product.get("template_id")
        row = await db.printer_template_prices.find_one(query, {"_id": 0}, sort=[("updated_at", -1)])
        if row:
            return money(row.get("total_price") or D(row.get("blank_price")) + D(row.get("print_price"))), {
                "printer_price_id": row.get("id"),
                "printer_price_version": row.get("updated_at") or "legacy-unversioned",
                "source": "printer_specific_price",
            }
    return money(creator_cost), {"printer_price_id": None, "printer_price_version": None, "source": "platform_fallback"}


def _commission_rate(product: Dict[str, Any], creator: Dict[str, Any], settings_raw: Dict[str, Any]) -> Decimal:
    value = product.get("commission_rate")
    if value is None:
        percent = creator.get("platform_commission_rate_percent")
        value = D(percent) / Decimal("100") if percent is not None else creator.get("commission_rate")
    if value is None:
        value = settings_raw.get("default_commission_rate") or Decimal("0.15")
    rate = D(value)
    if rate > 1:
        rate /= Decimal("100")
    return max(Decimal("0"), min(rate, Decimal("1")))


def _tax(unit_price: Decimal, tax: Dict[str, Any]) -> Tuple[Decimal, Decimal]:
    if not tax.get("enabled") or D(tax.get("rate")) <= 0:
        return money(unit_price), Decimal("0")
    rate = D(tax.get("rate")) / Decimal("100")
    if tax.get("prices_inclusive"):
        tax_amount = money(unit_price - unit_price / (Decimal("1") + rate))
        return money(unit_price), tax_amount
    tax_amount = money(unit_price * rate)
    return money(unit_price + tax_amount), tax_amount


async def calculate_product_pricing(
    db,
    *,
    product: Dict[str, Any],
    variation_id: Optional[str],
    quantity: int = 1,
    creator: Optional[Dict[str, Any]] = None,
    printer_id: Optional[str] = None,
    gateway: str = "paystack",
    customer_unit_price: Optional[Any] = None,
) -> Dict[str, Any]:
    qty = max(int(quantity or 1), 1)
    settings = await resolve_platform_settings(db)
    creator = creator or await db.creators.find_one({"id": product.get("band_id")}, {"_id": 0}) or {}
    template = await db.product_templates.find_one({"id": product.get("template_id")}, {"_id": 0}) if product.get("template_id") else {}
    variation = _variation(product, variation_id)
    blank_platform, blank_creator, blank_source = _blank_costs(product, template or {}, variation)
    print_platform, print_creator, print_sources = await _print_costs(db, product)
    operation_platform, operation_creator, operation_lines = _operation_costs(product)
    packaging = money(settings.launch.packaging_cost)
    creator_product_cost = money(blank_creator + print_creator + operation_creator + packaging)
    platform_internal_cost = money(blank_platform + print_platform + operation_platform + packaging)
    printer_liability, printer_source = await _printer_liability(db, product, printer_id, creator_product_cost)
    unit_price = money(
        customer_unit_price
        if customer_unit_price is not None
        else variation.get("price_override") if variation.get("price_override") is not None
        else product.get("selling_price") or product.get("customer_selling_price")
    )
    rate = _commission_rate(product, creator, settings.raw)
    commission = money(unit_price * rate)
    creator_earnings = money(unit_price - creator_product_cost - commission)
    if creator_earnings < 0:
        creator_earnings = Decimal("0")
    platform_gross_revenue = money(unit_price - creator_earnings)
    tax = tax_snapshot(settings)
    customer_unit_total, tax_amount = _tax(unit_price, tax)
    fee_rule = gateway_fee_snapshot(settings, gateway)
    estimated_fee = money(estimate_gateway_fee(float(customer_unit_total), fee_rule))
    customer_fee = estimated_fee if fee_rule.get("absorbed_by") == "customer" else Decimal("0")
    platform_fee = estimated_fee if fee_rule.get("absorbed_by") == "platform" else Decimal("0")
    customer_unit_total = money(customer_unit_total + customer_fee)
    platform_estimated_gross_profit = money(platform_gross_revenue - printer_liability - platform_fee)

    result = {
        "calculation_version": PRICING_VERSION,
        "currency": settings.currency,
        "settings_version": settings.version_id,
        "product_id": product.get("id"),
        "product_version": product.get("product_version") or 1,
        "template_id": product.get("template_id"),
        "template_version": blank_source.get("template_version"),
        "variation_id": variation.get("id") or variation_id,
        "quantity": qty,
        "platform_blank_cost": fmoney(blank_platform),
        "creator_blank_price": fmoney(blank_creator),
        "platform_printing_material_cost": fmoney(print_platform),
        "creator_printing_price": fmoney(print_creator),
        "platform_production_operation_cost": fmoney(operation_platform),
        "creator_operation_price": fmoney(operation_creator),
        "packaging_cost": fmoney(packaging),
        "creator_facing_product_cost": fmoney(creator_product_cost),
        "customer_selling_price": fmoney(unit_price),
        "customer_unit_total": fmoney(customer_unit_total),
        "platform_commission_rate": float(rate),
        "platform_commission": fmoney(commission),
        "creator_earnings": fmoney(creator_earnings),
        "printer_liability": fmoney(printer_liability),
        "platform_internal_cost": fmoney(platform_internal_cost),
        "platform_gross_revenue": fmoney(platform_gross_revenue),
        "platform_estimated_gross_profit": fmoney(platform_estimated_gross_profit),
        "tax": {**tax, "unit_tax_amount": fmoney(tax_amount)},
        "payment_fee": {**fee_rule, "estimated_unit_fee": fmoney(estimated_fee), "actual_unit_fee": None, "variance": None},
        "shipping": {"unit_allocation": 0.0, "treatment": settings.launch.financial_rules.shipping_refund_treatment},
        "sources": {
            **blank_source,
            "print_options": print_sources,
            "production_operations": operation_lines,
            **printer_source,
            "commission_source": "product_snapshot" if product.get("commission_rate") is not None else "creator_or_platform",
        },
        "calculated_at": utc_iso(),
    }
    result["calculation_sha256"] = stable_hash({k: v for k, v in result.items() if k != "calculated_at"})
    return result


def allocate_cents(total: Any, weights: List[Any]) -> List[Decimal]:
    target = money(total)
    values = [max(D(w), Decimal("0")) for w in weights]
    if not values:
        return []
    if sum(values) <= 0:
        values = [Decimal("1") for _ in values]
    raw = [target * value / sum(values) for value in values]
    rounded = [money(value) for value in raw]
    diff = target - sum(rounded)
    cents = int((diff / CENT).to_integral_value())
    order = sorted(range(len(raw)), key=lambda i: (raw[i] - rounded[i], -i), reverse=cents > 0)
    for index in order[:abs(cents)]:
        rounded[index] += CENT if cents > 0 else -CENT
    return rounded


async def enrich_order_items(db, items: List[Any], gateway: str = "paystack") -> List[Any]:
    for item in items:
        product = await db.products.find_one({"id": getattr(item, "product_id", None)}, {"_id": 0}) or {}
        pricing = await calculate_product_pricing(
            db,
            product=product,
            variation_id=getattr(item, "variation_id", None),
            quantity=getattr(item, "quantity", 1),
            printer_id=getattr(item, "printer_id", None),
            gateway=gateway,
            customer_unit_price=getattr(item, "unit_price", None),
        )
        qty = max(int(getattr(item, "quantity", 1) or 1), 1)
        item.unit_price = pricing["customer_selling_price"]
        item.commission_rate = pricing["platform_commission_rate"]
        item.commission_amount = fmoney(D(pricing["platform_commission"]) * qty)
        item.band_earnings = fmoney(D(pricing["creator_earnings"]) * qty)
        item.printer_payout = fmoney(D(pricing["printer_liability"]) * qty)
        item.print_cost_unit = pricing["creator_facing_product_cost"]
        snapshot = getattr(item, "production_snapshot", None)
        if snapshot is not None:
            if hasattr(snapshot, "model_dump"):
                snapshot_data = snapshot.model_dump()
            else:
                snapshot_data = dict(snapshot)
            snapshot_data["commercial_snapshot"] = pricing
            snapshot_data["costing_model"] = PRICING_VERSION
            snapshot_data["immutable"] = True
            item.production_snapshot = snapshot_data
    return items


async def finalize_order_allocations(db, order: Dict[str, Any]) -> Dict[str, Any]:
    items = deepcopy(order.get("items") or [])
    weights = [D(row.get("unit_price")) * max(int(row.get("quantity") or 1), 1) for row in items]
    shipping = allocate_cents(order.get("shipping_total") or 0, weights)
    order_discount = allocate_cents(order.get("discount_total") or 0, weights)
    promotion = allocate_cents(order.get("promotion_total") or 0, weights)
    item_totals = []
    for index, row in enumerate(items):
        qty = max(int(row.get("quantity") or 1), 1)
        snapshot = deepcopy((row.get("production_snapshot") or {}).get("commercial_snapshot") or {})
        unit = money(row.get("unit_price"))
        subtotal = money(unit * qty)
        tax_unit = D((snapshot.get("tax") or {}).get("unit_tax_amount"))
        fee_unit = D((snapshot.get("payment_fee") or {}).get("estimated_unit_fee"))
        snapshot.update({
            "quantity": qty,
            "subtotal": fmoney(subtotal),
            "item_discount": 0.0,
            "order_discount_allocation": fmoney(order_discount[index]),
            "promotion_allocation": fmoney(promotion[index]),
            "shipping_allocation": fmoney(shipping[index]),
            "taxable_amount": fmoney(subtotal - tax_unit * qty),
            "tax_amount": fmoney(tax_unit * qty),
            "payment_fee_allocation": fmoney(fee_unit * qty),
            "platform_commission_amount": fmoney(row.get("commission_amount")),
            "creator_earnings": fmoney(row.get("band_earnings")),
            "printer_liability": fmoney(row.get("printer_payout")),
            "refundable_balance": fmoney(subtotal),
            "already_refunded_amount": 0.0,
            "allocation_status": "allocated",
        })
        snapshot["allocation_sha256"] = stable_hash(snapshot)
        row.setdefault("production_snapshot", {})["commercial_snapshot"] = snapshot
        row["financial_snapshot"] = snapshot
        item_totals.append(subtotal)
    expected_subtotal = money(order.get("subtotal"))
    if sum(item_totals) != expected_subtotal:
        raise ValueError(f"Order item subtotal allocation mismatch: {sum(item_totals)} != {expected_subtotal}")
    order_snapshot = {
        "version": "order_finance_snapshot_v1",
        "currency": ((items[0].get("financial_snapshot") or {}).get("currency") if items else "ZAR"),
        "subtotal": fmoney(expected_subtotal),
        "shipping_total": fmoney(order.get("shipping_total")),
        "discount_total": fmoney(order.get("discount_total")),
        "promotion_total": fmoney(order.get("promotion_total")),
        "total": fmoney(order.get("total")),
        "item_count": len(items),
        "created_at": utc_iso(),
        "immutable": True,
    }
    order_snapshot["snapshot_sha256"] = stable_hash({k: v for k, v in order_snapshot.items() if k != "created_at"})
    await db.orders.update_one(
        {"id": order.get("id"), "financial_snapshot": {"$exists": False}},
        {"$set": {"items": items, "financial_snapshot": order_snapshot, "financial_snapshot_status": "allocated"}},
    )
    return await db.orders.find_one({"id": order.get("id")}, {"_id": 0}) or {**order, "items": items, "financial_snapshot": order_snapshot}


def replay_matches(snapshot: Dict[str, Any]) -> bool:
    expected = snapshot.get("calculation_sha256")
    return bool(expected and expected == stable_hash({k: v for k, v in snapshot.items() if k not in {"calculated_at", "calculation_sha256"}}))


def install_authoritative_pricing(routes_main_module: Any) -> None:
    if getattr(routes_main_module, "_authoritative_pricing_installed", False):
        return
    original_normalize = routes_main_module.normalize_template_product_payload
    original_build_items = routes_main_module._build_order_items

    async def wrapped_normalize(*, db, data, creator, user, allow_admin_publish=False):
        normalized = await original_normalize(db=db, data=data, creator=creator, user=user, allow_admin_publish=allow_admin_publish)
        preview = await calculate_product_pricing(
            db,
            product=normalized,
            variation_id=((normalized.get("variations") or [{}])[0]).get("id"),
            creator=creator,
            printer_id=normalized.get("assigned_printer_id"),
            customer_unit_price=normalized.get("selling_price"),
        )
        normalized.update({
            "authoritative_pricing": preview,
            "pricing_version": PRICING_VERSION,
            "platform_blank_cost": preview["platform_blank_cost"],
            "creator_blank_price": preview["creator_blank_price"],
            "platform_print_cost": preview["platform_printing_material_cost"] + preview["platform_production_operation_cost"],
            "creator_print_price": preview["creator_printing_price"] + preview["creator_operation_price"],
            "creator_product_cost": preview["creator_facing_product_cost"],
            "estimated_commission": preview["platform_commission"],
            "estimated_creator_profit": preview["creator_earnings"],
            "estimated_platform_profit": preview["platform_estimated_gross_profit"],
        })
        return normalized

    async def wrapped_build_items(db, cart_items, shipping_address=None):
        items, subtotal = await original_build_items(db, cart_items, shipping_address)
        return await enrich_order_items(db, items), subtotal

    routes_main_module.normalize_template_product_payload = wrapped_normalize
    routes_main_module._build_order_items = wrapped_build_items
    routes_main_module._authoritative_pricing_installed = True
