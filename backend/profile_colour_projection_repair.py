"""Preserve and derive profile-level stocked-colour configuration.

Canonical manufacturing profiles are merged with legacy compatibility profiles.
Legacy rows do not own colour configuration and must never erase a restriction.
For the completed HTV supplier ranges, profile identity and colour mapping are
projected authoritatively so the admin API and Creator Studio remain correct even
when a live legacy document has not persisted the new fields yet.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

import htv_profile_colour_assignment as htv_assignment
from htv_profile_colour_assignment import (
    HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION,
    PROFILE_RANGES,
    profile_range_key,
)
from seed_production_operations import normalize_method_key


RESTRICTED_MODES = {"restricted", "selected", "profile_restricted", "subset"}
INHERIT_MODES = {"inherit", "inherit_method", "all", "method"}
COLOUR_MODE_FIELDS = (
    "colour_selection_mode",
    "color_selection_mode",
    "profile_colour_mode",
)
PROFILE_IDENTITY_FIELDS = (
    "id",
    "profile_id",
    "manufacturing_profile_id",
    "production_profile_id",
    "display_name",
    "profile_name",
    "profile_label",
    "display_label",
    "rule_name",
    "print_method",
    "print_size",
)


def _text_list(value: Any) -> List[str]:
    values: Iterable[Any]
    if isinstance(value, str):
        values = value.replace(",", "\n").splitlines()
    elif isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = []
    result: List[str] = []
    for item in values:
        token = str(item or "").strip()
        if token and token not in result:
            result.append(token)
    return result


def _explicit_colour_configuration(profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    explicit_mode = next(
        (
            str(profile.get(field) or "").strip().lower()
            for field in COLOUR_MODE_FIELDS
            if profile.get(field) not in (None, "")
        ),
        "",
    )
    supported_present = "supported_colour_ids" in profile or "stocked_colour_ids" in profile
    available_present = "available_colour_ids" in profile
    supported = _text_list(
        profile.get("supported_colour_ids")
        or profile.get("stocked_colour_ids")
        or []
    )
    available = (
        _text_list(profile.get("available_colour_ids"))
        if available_present
        else list(supported)
    )

    if explicit_mode in RESTRICTED_MODES or (not explicit_mode and supported):
        return {
            "colour_selection_mode": "restricted",
            "color_selection_mode": "restricted",
            "supported_colour_ids": supported,
            "available_colour_ids": available,
        }
    if explicit_mode in INHERIT_MODES:
        return {
            "colour_selection_mode": "inherit_method",
            "color_selection_mode": "inherit_method",
            "supported_colour_ids": [],
            "available_colour_ids": [],
        }
    if supported_present or available_present:
        mode = "restricted" if supported or available else "inherit_method"
        return {
            "colour_selection_mode": mode,
            "color_selection_mode": mode,
            "supported_colour_ids": supported,
            "available_colour_ids": available,
        }
    return None


def _canonical_profile_colour_overlays(unified, method: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    method_key = normalize_method_key(method.get("method_key") or method.get("internal_id"))
    overlays: Dict[str, Dict[str, Any]] = {}
    for source in method.get("costing_profiles") or []:
        if not isinstance(source, dict):
            continue
        configuration = _explicit_colour_configuration(source)
        if configuration is None:
            continue
        profile_id = unified.canonical_profile_id(method_key, source)
        overlay = deepcopy(configuration)
        for field in (
            "stocked_colour_seed_version",
            "stocked_colour_assignment_version",
        ):
            if source.get(field) not in (None, ""):
                overlay[field] = source.get(field)
        overlays[profile_id] = overlay
    return overlays


def _authoritative_htv_overlay(method: Dict[str, Any], profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if normalize_method_key(method.get("method_key") or method.get("internal_id")) != "htv":
        return None
    key = profile_range_key(profile)
    if key not in PROFILE_RANGES:
        return None
    ranges = PROFILE_RANGES[key]
    return {
        "colour_selection_mode": "restricted",
        "color_selection_mode": "restricted",
        "supported_colour_ids": list(ranges["supported"]),
        "available_colour_ids": list(ranges["available"]),
        "stocked_colour_assignment_version": HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION,
    }


def apply_canonical_profile_colour_overlays(
    unified,
    method: Dict[str, Any],
    profiles: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    explicit_overlays = _canonical_profile_colour_overlays(unified, method)
    result: List[Dict[str, Any]] = []
    for source in profiles:
        profile = deepcopy(source)
        explicit = explicit_overlays.get(str(profile.get("id") or ""))
        if explicit:
            profile.update(deepcopy(explicit))
        authoritative = _authoritative_htv_overlay(method, profile)
        if authoritative:
            profile.update(deepcopy(authoritative))
        result.append(profile)
    return result


def _install_identity_aware_rate_classifier() -> None:
    """Teach the rate resolver to use canonical IDs and display names first."""
    import outsourced_production_rates as rates

    if getattr(rates, "_identity_aware_profile_key_installed", False):
        htv_assignment.profile_key_for_record = rates.profile_key_for_record
        return

    original_profile_key = rates.profile_key_for_record

    def identity_aware_profile_key(record: Optional[Dict[str, Any]], fallback_method: str = ""):
        row = dict(record or {})
        explicit = str(row.get("outsourced_rate_profile_key") or "").strip().lower()
        if explicit in rates.RATE_SPECS:
            return explicit

        identity = " ".join(str(row.get(field) or "") for field in PROFILE_IDENTITY_FIELDS)
        augmented = dict(row)
        augmented["rule_name"] = " ".join(
            value for value in (str(row.get("rule_name") or "").strip(), identity.strip()) if value
        )
        return original_profile_key(augmented, fallback_method)

    rates.profile_key_for_record = identity_aware_profile_key
    rates._identity_aware_profile_key_installed = True
    htv_assignment.profile_key_for_record = identity_aware_profile_key


def install_profile_colour_projection_repair(routes_production_rules_module=None) -> None:
    """Patch profile identity, canonical projections and imported bindings."""
    import production_method_profiles as profile_views
    import unified_manufacturing_costing as unified

    _install_identity_aware_rate_classifier()

    if not getattr(unified, "_profile_colour_projection_repair_v2_installed", False):
        original_canonical_profiles = unified.canonical_profiles_for_method
        original_method_with_profiles = unified.method_with_unified_profiles

        def patched_canonical_profiles_for_method(
            method: Dict[str, Any],
            *,
            additional_profiles: Optional[Iterable[Dict[str, Any]]] = None,
        ) -> List[Dict[str, Any]]:
            profiles = original_canonical_profiles(
                method,
                additional_profiles=additional_profiles,
            )
            return apply_canonical_profile_colour_overlays(unified, method, profiles)

        def patched_method_with_unified_profiles(method: Dict[str, Any]) -> Dict[str, Any]:
            row = original_method_with_profiles(method)
            row["costing_profiles"] = apply_canonical_profile_colour_overlays(
                unified,
                method,
                row.get("costing_profiles") or [],
            )
            return row

        unified.canonical_profiles_for_method = patched_canonical_profiles_for_method
        unified.method_with_unified_profiles = patched_method_with_unified_profiles
        unified._profile_colour_projection_repair_v2_installed = True

    # production_method_profiles imports these functions by value before this patch
    # is installed, so replace those bindings explicitly as well.
    profile_views.canonical_profiles_for_method = unified.canonical_profiles_for_method
    profile_views.method_with_unified_profiles = unified.method_with_unified_profiles

    if routes_production_rules_module is not None:
        routes_production_rules_module.canonical_profiles_for_method = unified.canonical_profiles_for_method
        routes_production_rules_module.method_with_unified_profiles = unified.method_with_unified_profiles
