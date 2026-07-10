"""Builder-facing production method pricing profiles.

This is the bridge away from raw legacy Print Options. Legacy Print Options remain
as source/compatibility records, but Template Studio and Creator Builder should
select these production-method profiles. Each returned row is intentionally
PrintOption-compatible because the existing Builder costing code already knows
how to calculate fixed, area and sheet pricing from those fields.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from seed_production_operations import normalize_method_key


PROFILE_PRICING_FIELDS = (
    "calculation_type",
    "platform_print_cost",
    "print_cost_max",
    "sheet_width_mm",
    "sheet_height_mm",
    "sheet_cost",
    "cost_per_cm2",
    "minimum_print_cost",
    "waste_percentage",
    "markup_percentage",
    "creator_print_price",
    "platform_print_markup_type",
    "platform_print_markup_value",
    "pricing_notes",
    "standard_print_size_key",
    "width_mm",
    "height_mm",
    "dpi",
    "fit_mode",
    "print_positions",
    "status",
)

PROFILE_FIELD_ALIASES = {
    "calculation_type": ("calculationType",),
    "platform_print_cost": ("profilePrintCostMax", "methodPrintCostMax"),
    "print_cost_max": ("profilePrintCostMax", "methodPrintCostMax"),
    "sheet_width_mm": ("profileSheetWidthMm", "sheetWidthMm"),
    "sheet_height_mm": ("profileSheetHeightMm", "sheetHeightMm"),
    "sheet_cost": ("profileSheetCost", "sheetCost"),
    "cost_per_cm2": ("profileCostPerCm2", "costPerCm2"),
    "minimum_print_cost": ("profileMinimumPrintCost", "minimumPrintCost"),
    "waste_percentage": ("profileWastePercentage", "wastePercentage"),
    "markup_percentage": ("profileMarkupPercentage", "markupPercentage"),
    "creator_print_price": ("profileCreatorPrintPrice", "creatorPrintPrice"),
    "platform_print_markup_type": ("profilePlatformPrintMarkupType", "platformPrintMarkupType"),
    "platform_print_markup_value": ("profilePlatformPrintMarkupValue", "platformPrintMarkupValue"),
    "pricing_notes": ("profilePricingNotes", "pricingNotes"),
    "print_positions": ("printPositions", "printPositionsText"),
    "status": ("profileStatus",),
}

METHOD_LABELS = {
    "dtf": "DTF",
    "sublimation": "Sublimation",
    "htv": "HTV",
    "uv_dtf": "UV DTF",
    "adhesive_vinyl": "Adhesive Vinyl",
}


PRICING_TEXT_PATTERNS = (
    r"\s*-\s*cost\s+per\s+cm²?.*$",
    r"\s*·\s*dynamic\s+area\s+cm²?.*$",
    r"\s*·\s*area\s+from\s+sheet.*$",
    r"\s*·\s*area\s+fixed\s+rate.*$",
    r"\s*·\s*fixed.*$",
)


def _is_set(value: Any) -> bool:
    return value not in (None, "", [], {})


def _value(source: Dict[str, Any], field: str, fallback: Any = None) -> Any:
    if field in source and _is_set(source.get(field)):
        return source.get(field)
    for alias in PROFILE_FIELD_ALIASES.get(field, ()):  # accepts admin-draft field names too
        if alias in source and _is_set(source.get(alias)):
            return source.get(alias)
    return fallback


def _num(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback)


def _list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [item.strip() for item in value.replace(",", "\n").splitlines() if item.strip()]
    return []


def _slug(value: Any) -> str:
    return str(value or "").strip().lower().replace("&", "and").replace("/", " ").replace("-", "_").replace(" ", "_")


def _clean_label_text(value: Any) -> str:
    label = re.sub(r"\s+", " ", str(value or "").strip())
    for pattern in PRICING_TEXT_PATTERNS:
        label = re.sub(pattern, "", label, flags=re.IGNORECASE).strip()
    return label


def _strip_method_prefix(label: str, method_label: str) -> str:
    text = _clean_label_text(label)
    prefix = re.escape(method_label)
    text = re.sub(rf"^{prefix}\s*[-–—:·]?\s*", "", text, flags=re.IGNORECASE).strip()
    return text


def _profile_label(method_key: str, method_name: str, profile: Dict[str, Any], rule_name: str) -> str:
    explicit = profile.get("profile_label") or profile.get("display_label") or profile.get("label")
    if explicit:
        return _clean_label_text(explicit)

    method_label = METHOD_LABELS.get(method_key) or _clean_label_text(method_name) or method_key.upper()
    raw = _clean_label_text(rule_name or profile.get("print_method") or profile.get("print_size") or method_label)

    if method_key == "dtf":
        suffix = _strip_method_prefix(raw, "DTF")
        if suffix.lower() in {"transfer", "transfers", "dtf transfer", "dtf transfers", ""}:
            return "DTF Transfer"
        return f"DTF - {suffix}"

    suffix = _strip_method_prefix(raw, method_label)
    if not suffix:
        return method_label
    return f"{method_label} - {suffix}"


def _profile_identity(method_key: str, profile: Dict[str, Any]) -> str:
    return str(
        profile.get("print_option_id")
        or profile.get("id")
        or profile.get("slug")
        or f"production_method:{method_key}:{_slug(profile.get('rule_name') or profile.get('print_size') or 'profile')}"
    )


def _method_default_profile(method: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    model = dict(method.get("cost_calculation_model") or {})
    if not model:
        return None
    if not any(_is_set(_value(model, field)) for field in PROFILE_PRICING_FIELDS):
        return None
    return {
        "source": "production_method_default_cost_model",
        "print_option_id": f"production_method:{method.get('method_key')}",
        "rule_name": model.get("model") or model.get("name") or method.get("display_name") or method.get("method_key"),
        "print_method": method.get("display_name") or method.get("method_key"),
        "print_size": model.get("print_size") or "Method Default",
        "status": method.get("status") or ("active" if method.get("active", True) else "draft"),
        **{field: _value(model, field) for field in PROFILE_PRICING_FIELDS if _is_set(_value(model, field))},
    }


def production_method_profile_to_print_option(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    method_key = normalize_method_key(method.get("method_key") or method.get("internal_id"))
    method_name = method.get("display_name") or method_key
    profile_id = _profile_identity(method_key, profile)
    rule_name = profile.get("rule_name") or profile.get("print_size") or method_name
    label = _profile_label(method_key, method_name, profile, rule_name)
    original_print_size = profile.get("print_size") or profile.get("standard_print_size_key") or "Method Profile"
    calculation_type = _value(profile, "calculation_type", "fixed") or "fixed"
    platform_print_cost = _num(_value(profile, "platform_print_cost", _value(profile, "print_cost_max", 0)), 0)
    print_cost_max = _num(_value(profile, "print_cost_max", _value(profile, "platform_print_cost", 0)), 0)

    row: Dict[str, Any] = {
        "id": profile_id,
        "legacy_print_option_id": profile.get("print_option_id") or None,
        "source": "production_method_profile",
        "production_method_profile": True,
        "production_profile_source": profile.get("source") or "legacy_print_option",
        "production_method_id": method.get("id"),
        "manufacturing_method_id": method_key,
        "production_method_key": method_key,
        "method_key": method_key,
        "method": method_name,
        "print_method": label,
        "rule_name": rule_name,
        "profile_label": label,
        "display_name": label,
        "print_size": "",
        "profile_print_size": original_print_size,
        "calculation_type": calculation_type,
        "platform_print_cost": platform_print_cost,
        "print_cost_max": print_cost_max,
        "creator_print_price": _num(_value(profile, "creator_print_price", 0), 0),
        "platform_print_profit": _num(profile.get("platform_print_profit"), 0),
        "status": _value(profile, "status", profile.get("status") or ("active" if method.get("active", True) else "draft")),
        "source_print_option_id": profile.get("print_option_id") or None,
        "source_print_option_slug": profile.get("print_option_slug") or None,
        "supported_colours": method.get("supported_colours") or {},
        "creator_restrictions": method.get("creator_restrictions") or {},
        "layer_behaviour": method.get("layer_behaviour") or {},
        "press_behaviour": method.get("press_behaviour") or {},
        "cost_calculation_model": method.get("cost_calculation_model") or {},
        "production_method_display_name": method_name,
    }

    for field in PROFILE_PRICING_FIELDS:
        value = _value(profile, field)
        if _is_set(value):
            row[field] = value

    # Keep the selector label clean. The original profile/standard size is still
    # available through profile_print_size and standard_print_size_key for costing.
    row["print_method"] = label
    row["display_name"] = label
    row["print_size"] = ""
    row["profile_print_size"] = original_print_size

    row["platform_print_cost"] = _num(row.get("platform_print_cost") if _is_set(row.get("platform_print_cost")) else row.get("print_cost_max"), 0)
    row["print_cost_max"] = _num(row.get("print_cost_max") if _is_set(row.get("print_cost_max")) else row.get("platform_print_cost"), 0)
    row["cost_per_cm2"] = _num(row.get("cost_per_cm2"), 0)
    row["minimum_print_cost"] = _num(row.get("minimum_print_cost"), 0)
    row["sheet_width_mm"] = _num(row.get("sheet_width_mm"), 0)
    row["sheet_height_mm"] = _num(row.get("sheet_height_mm"), 0)
    row["sheet_cost"] = _num(row.get("sheet_cost"), 0)
    row["waste_percentage"] = _num(row.get("waste_percentage"), 0)
    row["markup_percentage"] = _num(row.get("markup_percentage"), 0)
    row["dpi"] = int(_num(row.get("dpi"), 300) or 300)
    row["fit_mode"] = row.get("fit_mode") or "contain"
    row["print_positions"] = _list(row.get("print_positions"))
    return row


async def list_production_method_print_profiles(db, *, active: bool = True) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {}
    if active is not None:
        query["active"] = active
    methods = await db.production_methods.find(query, {"_id": 0}).sort("display_name", 1).to_list(200)
    rows: List[Dict[str, Any]] = []

    for method in methods:
        profiles = list(method.get("legacy_print_option_costing_profiles") or [])
        default_profile = _method_default_profile(method)
        if default_profile and not profiles:
            profiles.append(default_profile)

        for profile in profiles:
            if not isinstance(profile, dict):
                continue
            rows.append(production_method_profile_to_print_option(method, profile))

    return sorted(rows, key=lambda row: (str(row.get("production_method_display_name") or ""), str(row.get("profile_label") or row.get("rule_name") or ""), str(row.get("profile_print_size") or "")))
