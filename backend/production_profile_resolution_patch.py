"""Resolve Builder slots against canonical manufacturing costing profiles."""
from __future__ import annotations

from typing import Any, Dict, Optional

import production_operation_pricing as pricing_runtime
from unified_manufacturing_costing import resolve_costing_profile


CANONICAL_PROFILE_FIELDS = (
    "minimum_area_cm2",
    "application_cost",
    "manufacturing_profile_id",
    "production_profile_id",
    "legacy_print_option_ids",
    "is_default",
    "costing_engine_version",
)


def resolve_method_profile_for_slot(
    method_rule: Optional[Dict[str, Any]],
    option: Dict[str, Any],
    slot: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    identifier = (
        slot.get("manufacturing_profile_id")
        or slot.get("production_profile_id")
        or slot.get("print_option_id")
        or option.get("manufacturing_profile_id")
        or option.get("production_profile_id")
        or option.get("id")
    )
    return resolve_costing_profile(method_rule, identifier, option=option, slot=slot)


def install_production_profile_resolution_patch() -> None:
    if getattr(pricing_runtime, "_production_profile_resolution_patch_installed", False):
        return
    fields = list(pricing_runtime.PRICING_FIELDS)
    for field in CANONICAL_PROFILE_FIELDS:
        if field not in fields:
            fields.append(field)
    pricing_runtime.PRICING_FIELDS = tuple(fields)
    pricing_runtime._base_method_profile_for_slot = pricing_runtime._method_profile_for_slot
    pricing_runtime._method_profile_for_slot = resolve_method_profile_for_slot
    pricing_runtime._production_profile_resolution_patch_installed = True
