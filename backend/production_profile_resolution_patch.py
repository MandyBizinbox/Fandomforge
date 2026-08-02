"""Make production-method pricing profile selection deterministic.

Legacy pricing profiles commonly share broad identifiers such as
``dynamic_area_cm2``. The original resolver returned the first profile matching
any identifier, which allowed a broad standard-size match to win before the
profile whose ``print_option_id`` exactly matched the Builder slot.

This patch preserves the existing fallback behaviour while resolving exact Print
Option identity across the full profile list first.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

import production_operation_pricing as pricing_runtime


def _token(value: Any) -> str:
    return str(value or "").strip().lower()


def resolve_method_profile_for_slot(
    method_rule: Optional[Dict[str, Any]],
    option: Dict[str, Any],
    slot: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Return the most specific legacy pricing profile for a Builder slot.

    Resolution precedence is deliberate:
    1. exact ``print_option_id``;
    2. standard print-size key;
    3. print-size label;
    4. rule or print-method label.

    Each tier scans the complete profile collection before the next, preventing
    an earlier generic profile from shadowing a later exact match.
    """
    rule = dict(method_rule or {})
    profiles = [
        profile
        for profile in (rule.get("legacy_print_option_costing_profiles") or [])
        if isinstance(profile, dict)
    ]
    if not profiles:
        return None

    option_id = _token(option.get("id") or slot.get("print_option_id"))
    if option_id:
        for profile in profiles:
            if _token(profile.get("print_option_id")) == option_id:
                return profile

    standard_key = _token(
        option.get("standard_print_size_key")
        or slot.get("standard_print_size_key")
    )
    if standard_key:
        for profile in profiles:
            if _token(profile.get("standard_print_size_key")) == standard_key:
                return profile

    print_size = _token(option.get("print_size") or slot.get("print_size"))
    if print_size:
        for profile in profiles:
            if _token(profile.get("print_size")) == print_size:
                return profile

    rule_name = _token(
        option.get("rule_name")
        or option.get("print_method")
        or slot.get("print_method")
    )
    if rule_name:
        for profile in profiles:
            if rule_name in {
                _token(profile.get("rule_name")),
                _token(profile.get("print_method")),
            }:
                return profile

    return None


def install_production_profile_resolution_patch() -> None:
    """Install the resolver once before production costing is evaluated."""
    if getattr(pricing_runtime, "_production_profile_resolution_patch_installed", False):
        return

    pricing_runtime._base_method_profile_for_slot = pricing_runtime._method_profile_for_slot
    pricing_runtime._method_profile_for_slot = resolve_method_profile_for_slot
    pricing_runtime._production_profile_resolution_patch_installed = True
