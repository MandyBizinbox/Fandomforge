"""Preserve profile-level stocked-colour configuration through canonical merges.

The unified costing engine merges canonical profiles with legacy compatibility
profiles. Compatibility rows do not own colour configuration and must never erase
an explicit restriction stored on the canonical manufacturing profile.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional, Tuple

from seed_production_operations import normalize_method_key


RESTRICTED_MODES = {"restricted", "selected", "profile_restricted", "subset"}
INHERIT_MODES = {"inherit", "inherit_method", "all", "method"}
COLOUR_MODE_FIELDS = (
    "colour_selection_mode",
    "color_selection_mode",
    "profile_colour_mode",
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
        (str(profile.get(field) or "").strip().lower() for field in COLOUR_MODE_FIELDS if profile.get(field) not in (None, "")),
        "",
    )
    supported_present = "supported_colour_ids" in profile or "stocked_colour_ids" in profile
    available_present = "available_colour_ids" in profile
    supported = _text_list(profile.get("supported_colour_ids") or profile.get("stocked_colour_ids") or [])
    available = _text_list(profile.get("available_colour_ids")) if available_present else list(supported)

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
        return {
            "colour_selection_mode": "restricted" if supported or available else "inherit_method",
            "color_selection_mode": "restricted" if supported or available else "inherit_method",
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


def apply_canonical_profile_colour_overlays(
    unified,
    method: Dict[str, Any],
    profiles: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    overlays = _canonical_profile_colour_overlays(unified, method)
    result: List[Dict[str, Any]] = []
    for source in profiles:
        profile = deepcopy(source)
        overlay = overlays.get(str(profile.get("id") or ""))
        if overlay:
            profile.update(deepcopy(overlay))
        result.append(profile)
    return result


def install_profile_colour_projection_repair(routes_production_rules_module=None) -> None:
    """Patch canonical profile generation and any already-imported route binding."""
    import unified_manufacturing_costing as unified

    if not getattr(unified, "_profile_colour_projection_repair_installed", False):
        original_canonical_profiles = unified.canonical_profiles_for_method

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

        unified.canonical_profiles_for_method = patched_canonical_profiles_for_method
        unified._profile_colour_projection_repair_installed = True

    if routes_production_rules_module is not None:
        routes_production_rules_module.canonical_profiles_for_method = unified.canonical_profiles_for_method
