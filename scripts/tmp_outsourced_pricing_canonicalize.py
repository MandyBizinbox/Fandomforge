from pathlib import Path
import ast

root = Path('.')

# 1) Unified costing owns canonical-profile editability directly.
p = root/'backend/unified_manufacturing_costing.py'
s = p.read_text()
old = '''def _apply_approved_rate(profile: Dict[str, Any], method_key: str) -> Dict[str, Any]:\n    values = pricing_values_for_record(profile, method_key)\n    if not values:\n        return profile\n    return {**profile, **values, "platform_print_cost": 0.0, "print_cost_max": 0.0, "creator_print_price": 0.0}\n'''
new = '''def _apply_approved_rate(profile: Dict[str, Any], method_key: str) -> Dict[str, Any]:\n    # Canonical profiles are editable manufacturing records. Once migrated, do not\n    # overwrite their saved pricing with legacy outsourced defaults on every read.\n    if (\n        profile.get("costing_engine_version") == UNIFIED_COSTING_ENGINE_VERSION\n        and str(profile.get("id") or profile.get("profile_id") or "").startswith("profile:")\n    ):\n        return profile\n    values = pricing_values_for_record(profile, method_key)\n    if not values:\n        return profile\n    return {**profile, **values, "platform_print_cost": 0.0, "print_cost_max": 0.0, "creator_print_price": 0.0}\n'''
assert old in s
s=s.replace(old,new,1)
ast.parse(s); p.write_text(s)

# 2) Builder-facing profile projection owns legacy outsourced enrichment.
p = root/'backend/production_method_profiles.py'
s = p.read_text()
s=s.replace('from typing import Any, Dict, List\n\nfrom seed_production_operations', 'from typing import Any, Dict, List\n\nimport outsourced_production_rates as outsourced_rates\nfrom seed_production_operations',1)
s=s.replace('    canonical_profiles_for_method,\n', '    UNIFIED_COSTING_ENGINE_VERSION,\n    canonical_profiles_for_method,\n',1)
insert='''\n\ndef _number(value: Any, fallback: float = 0.0) -> float:\n    try:\n        return float(value if value not in (None, "") else fallback)\n    except (TypeError, ValueError):\n        return float(fallback)\n'''
anchor='def _normalise_colour(colour: Any) -> Dict[str, Any] | None:\n'
assert anchor in s
s=s.replace(anchor,insert+'\n'+anchor,1)
old_return='''    return sorted(\n        rows,\n        key=lambda row: (\n            str(row.get("production_method_display_name") or ""),\n            0 if row.get("is_default") else 1,\n            str(row.get("profile_label") or ""),\n        ),\n    )\n'''
new_return='''    rows = sorted(\n        rows,\n        key=lambda row: (\n            str(row.get("production_method_display_name") or ""),\n            0 if row.get("is_default") else 1,\n            str(row.get("profile_label") or ""),\n        ),\n    )\n\n    # Only legacy compatibility rows still need approved outsourced defaults.\n    # Canonical manufacturing profiles must preserve their editable saved values.\n    legacy_rows = [\n        row for row in rows\n        if row.get("costing_engine_version") != UNIFIED_COSTING_ENGINE_VERSION\n        and row.get("source_type") != "manufacturing_costing_profile"\n    ]\n    enriched_legacy = await outsourced_rates.enrich_profile_rows(db, legacy_rows) if legacy_rows else []\n    legacy_by_id = {str(row.get("id")): row for row in enriched_legacy}\n    output: List[Dict[str, Any]] = []\n    for row in rows:\n        current = legacy_by_id.get(str(row.get("id")), row)\n        if current.get("outsourced_rate_profile_key"):\n            current["calculation_type"] = "area_fixed_rate"\n            current["platform_print_cost"] = 0.0\n            current["print_cost_max"] = 0.0\n            current["creator_print_price"] = 0.0\n            current["minimum_print_cost"] = _number(current.get("minimum_print_cost"), 0.0)\n        output.append(current)\n    return output\n'''
assert old_return in s
s=s.replace(old_return,new_return,1)
ast.parse(s); p.write_text(s)

# 3) Production operation pricing becomes a normal service, including outsourced area rates.
p=root/'backend/production_operation_pricing.py'
s=p.read_text()
s=s.replace('from typing import Any, Dict, List, Optional\n\nfrom seed_production_operations', 'from decimal import Decimal, ROUND_HALF_UP\nfrom typing import Any, Callable, Dict, List, Optional\n\nimport outsourced_production_rates as outsourced_rates\nfrom seed_production_operations',1)
old_fields='''    "pricing_notes",\n)\n'''
new_fields='''    "pricing_notes",\n    "minimum_area_cm2",\n    "application_cost",\n    "outsourced_rate_profile_key",\n    "outsourced_rate_profile_label",\n    "outsourced_rate_version",\n    "manufacturing_profile_id",\n    "production_profile_id",\n    "legacy_print_option_ids",\n    "is_default",\n    "costing_engine_version",\n)\n\nDIRECT_APPLICATION_OPERATION_TYPES = {"heat_press", "application"}\n\ndef _money_half_up(value: Any) -> float:\n    try:\n        decimal_value = Decimal(str(value if value not in (None, "") else 0))\n    except Exception:\n        decimal_value = Decimal("0")\n    return float(decimal_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))\n\ndef _embedded_application_methods(product_data: Dict[str, Any]) -> set[str]:\n    methods: set[str] = set()\n    for slot in product_data.get("artworks") or []:\n        if not isinstance(slot, dict) or _float(slot.get("application_cost")) <= 0:\n            continue\n        method = normalize_method_key(\n            slot.get("method_key")\n            or slot.get("manufacturing_method_id")\n            or slot.get("production_method_key")\n            or slot.get("print_method")\n        )\n        if method:\n            methods.add(method)\n    return methods\n'''
assert old_fields in s
s=s.replace(old_fields,new_fields,1)
# Replace raw-cost function wholesale up to creator price.
start=s.index('def _calculate_raw_print_cost(')
end=s.index('def _creator_print_price(', start)
raw='''def _calculate_raw_print_cost(option: Dict[str, Any], slot: Dict[str, Any]) -> Dict[str, Any]:\n    calculation_type = str(option.get("calculation_type") or slot.get("calculation_type") or "fixed").lower()\n    area_cm2 = _slot_area_cm2(slot)\n\n    if calculation_type in {"area_fixed_rate", "area", "cm2", "sheet", "area_from_sheet"}:\n        pricing = {**slot, **option, "calculation_type": calculation_type}\n        costing = outsourced_rates.calculate_outsourced_area_cost(\n            area_cm2,\n            pricing,\n            fallback_cost=(option.get("platform_print_cost") or option.get("print_cost_max") or slot.get("print_cost_max") or 0),\n        )\n        return {\n            "calculation_type": calculation_type,\n            "area_cm2": costing["actual_area_cm2"],\n            "chargeable_area_cm2": costing["chargeable_area_cm2"],\n            "minimum_area_cm2": costing["minimum_area_cm2"],\n            "minimum_area_applied": costing["minimum_area_applied"],\n            "application_cost": costing["application_cost"],\n            "platform_print_cost": costing["calculated_print_cost"],\n            "production_pricing_source": option.get("production_pricing_source") or "production_method",\n            "production_method_key": option.get("production_method_key"),\n            "manufacturing_profile_id": option.get("manufacturing_profile_id") or slot.get("manufacturing_profile_id"),\n            "legacy_print_option_profile_id": option.get("legacy_print_option_profile_id"),\n            "legacy_print_option_profile_name": option.get("legacy_print_option_profile_name"),\n        }\n\n    platform_cost = _float(option.get("platform_print_cost") or option.get("print_cost_max") or slot.get("print_cost_max"))\n    waste_percentage = _float(option.get("waste_percentage") or slot.get("waste_percentage"))\n    if platform_cost > 0 and waste_percentage:\n        platform_cost *= 1 + (waste_percentage / 100)\n    markup_percentage = _float(option.get("markup_percentage") or slot.get("markup_percentage"))\n    if platform_cost > 0 and markup_percentage:\n        platform_cost *= 1 + (markup_percentage / 100)\n    minimum_print_cost = _float(option.get("minimum_print_cost") or slot.get("minimum_print_cost"))\n    if platform_cost > 0 and minimum_print_cost:\n        platform_cost = max(platform_cost, minimum_print_cost)\n    return {\n        "calculation_type": calculation_type,\n        "area_cm2": round(area_cm2, 2),\n        "platform_print_cost": _money(platform_cost),\n        "production_pricing_source": option.get("production_pricing_source") or "print_option",\n        "production_method_key": option.get("production_method_key"),\n        "legacy_print_option_profile_id": option.get("legacy_print_option_profile_id"),\n        "legacy_print_option_profile_name": option.get("legacy_print_option_profile_name"),\n    }\n\n\n'''
s=s[:start]+raw+s[end:]
# Decouple creator price from routes module.
s=s.replace('def _creator_print_price(routes_main_module: Any, option: Dict[str, Any], platform_print_cost: float) -> float:', 'def _creator_print_price(resolve_marked_price: Optional[Callable], option: Dict[str, Any], platform_print_cost: float) -> float:',1)
s=s.replace('    resolver = getattr(routes_main_module, "_resolve_marked_price", None)\n    if callable(resolver):\n        return _money(resolver(', '    if callable(resolve_marked_price):\n        return _money(resolve_marked_price(',1)
s=s.replace('async def _repair_missing_raw_print_costs(db, routes_main_module: Any, product_data: Dict[str, Any]) -> Dict[str, Any]:', 'async def _repair_missing_raw_print_costs(db, resolve_marked_price: Optional[Callable], product_data: Dict[str, Any]) -> Dict[str, Any]:',1)
s=s.replace('creator_price = _creator_print_price(routes_main_module, active_option, live_platform_cost)', 'creator_price = _creator_print_price(resolve_marked_price, active_option, live_platform_cost)',1)
# Rewrite operation breakdown return to suppress double-charged embedded application ops.
old='''    return {\n        "lines": lines,\n        "method_keys": method_keys,\n        "platform_operation_cost": round(total_platform_cost, 2),\n        "estimated_operation_time": round(total_estimated_time, 2),\n    }\n'''
new='''    embedded_methods = _embedded_application_methods(product_data)\n    if embedded_methods:\n        lines = [\n            line for line in lines\n            if not (\n                normalize_method_key(line.get("method_key")) in embedded_methods\n                and str(line.get("operation_type") or "") in DIRECT_APPLICATION_OPERATION_TYPES\n            )\n        ]\n        total_platform_cost = sum(_float(line.get("platform_cost")) for line in lines)\n        total_estimated_time = sum(_float(line.get("estimated_time")) for line in lines)\n\n    result = {\n        "lines": lines,\n        "method_keys": method_keys,\n        "platform_operation_cost": _money_half_up(total_platform_cost),\n        "estimated_operation_time": round(total_estimated_time, 2),\n    }\n    if embedded_methods:\n        result["embedded_application_methods"] = sorted(embedded_methods)\n        result["direct_application_operations_suppressed"] = True\n    return result\n'''
assert old in s
s=s.replace(old,new,1)
# Decouple refresh from routes module.
s=s.replace('def _refresh_product_costing(routes_main_module: Any, product_data: Dict[str, Any], operation_breakdown: Dict[str, Any]) -> Dict[str, Any]:', 'def _refresh_product_costing(platform_costing_breakdown: Callable, product_data: Dict[str, Any], operation_breakdown: Dict[str, Any]) -> Dict[str, Any]:',1)
s=s.replace('operation_creator_price = _operation_creator_price(routes_main_module, platform_operation_cost)', 'operation_creator_price = _operation_creator_price(None, platform_operation_cost)',1)
s=s.replace('    costing_fn = getattr(routes_main_module, "_platform_costing_breakdown")\n    costing = costing_fn(', '    costing = platform_costing_breakdown(',1)
# Replace installer with canonical application function.
start=s.index('def install_production_operation_pricing(')
s=s[:start]+'''async def apply_production_operation_pricing(\n    db,\n    product_data: Dict[str, Any],\n    *,\n    resolve_marked_price: Optional[Callable] = None,\n    platform_costing_breakdown: Callable,\n) -> Dict[str, Any]:\n    """Apply print-cost repair and internal production-operation costing explicitly."""\n    product_data = await _repair_missing_raw_print_costs(db, resolve_marked_price, product_data)\n    operation_breakdown = await _production_operation_breakdown(db, product_data)\n    return _refresh_product_costing(platform_costing_breakdown, product_data, operation_breakdown)\n'''
ast.parse(s); p.write_text(s)

# 4) routes_main explicitly invokes the service after canonical product normalization.
p=root/'backend/routes_main.py'; s=p.read_text()
anchor='''from product_artwork_costing import (\n    calculate_artwork_area_cost,\n    apply_combined_artwork_costing,\n)\n'''
assert anchor in s
s=s.replace(anchor,anchor+'from production_operation_pricing import apply_production_operation_pricing\n',1)
old='''async def normalize_template_product_payload(db, data: dict, creator: dict, user: User, allow_admin_publish: bool = False) -> dict:\n    return await normalize_builder_product_payload(\n        db=db, data=data, creator=creator, user=user,\n        allow_admin_publish=allow_admin_publish,\n        core_normalizer=_normalize_template_product_payload_core,\n    )\n'''
new='''async def normalize_template_product_payload(db, data: dict, creator: dict, user: User, allow_admin_publish: bool = False) -> dict:\n    product_data = await normalize_builder_product_payload(\n        db=db, data=data, creator=creator, user=user,\n        allow_admin_publish=allow_admin_publish,\n        core_normalizer=_normalize_template_product_payload_core,\n    )\n    return await apply_production_operation_pricing(\n        db,\n        product_data,\n        resolve_marked_price=_resolve_marked_price,\n        platform_costing_breakdown=_platform_costing_breakdown,\n    )\n'''
assert old in s
s=s.replace(old,new,1)
ast.parse(s); p.write_text(s)

# 5) Server no longer installs either runtime pricing patch.
p=root/'backend/server.py'; s=p.read_text()
for old in [
    'from production_operation_pricing import install_production_operation_pricing\n',
    'from outsourced_rate_runtime_patch import install_outsourced_rate_runtime\n',
    'install_production_operation_pricing(routes_main_module)\n',
    'install_outsourced_rate_runtime(routes_main_module)\n',
]:
    assert old in s, old
    s=s.replace(old,'')
ast.parse(s); p.write_text(s)

# 6) New focused tests.
t=root/'backend/tests/test_production_operation_pricing_service.py'
t.write_text('''import asyncio\n\nimport production_operation_pricing as pricing\n\n\ndef test_outsourced_area_rate_is_native_to_raw_cost_calculation():\n    result = pricing._calculate_raw_print_cost(\n        {\n            "calculation_type":"area_fixed_rate",\n            "cost_per_cm2":0.5,\n            "minimum_area_cm2":100,\n            "application_cost":10,\n            "minimum_print_cost":0,\n            "waste_percentage":0,\n            "markup_percentage":0,\n            "production_method_key":"dtf",\n        },\n        {"area_cm2":50,"manufacturing_profile_id":"profile:dtf:test"},\n    )\n    assert result["area_cm2"] == 50\n    assert result["chargeable_area_cm2"] == 100\n    assert result["application_cost"] == 10\n    assert result["platform_print_cost"] == 60\n    assert result["manufacturing_profile_id"] == "profile:dtf:test"\n\n\ndef test_embedded_application_method_detection():\n    methods = pricing._embedded_application_methods({\n        "artworks":[\n            {"method_key":"HTV","application_cost":5},\n            {"method_key":"dtf","application_cost":0},\n        ]\n    })\n    assert methods == {"htv"}\n''')

u=root/'backend/tests/test_unified_canonical_profile_editability.py'
u.write_text('''from unified_manufacturing_costing import _apply_approved_rate, UNIFIED_COSTING_ENGINE_VERSION\n\n\ndef test_canonical_profile_saved_rate_is_not_replaced_by_legacy_defaults():\n    profile={\n        "id":"profile:dtf:standard_dtf",\n        "profile_id":"profile:dtf:standard_dtf",\n        "costing_engine_version":UNIFIED_COSTING_ENGINE_VERSION,\n        "cost_per_cm2":9.99,\n        "calculation_type":"area_fixed_rate",\n    }\n    result=_apply_approved_rate(profile,"dtf")\n    assert result["cost_per_cm2"] == 9.99\n''')
print('outsourced pricing canonicalization applied')
