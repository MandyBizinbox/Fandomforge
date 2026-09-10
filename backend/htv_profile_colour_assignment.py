"""Authoritative HTV profile-to-colour assignments.

Individual supplier seeds populate the stocked-colour records and extend the HTV
method pool. This final pass assigns every completed range to the canonical costing
profiles in one atomic method update so the admin UI and Creator Studio cannot
fall back to "all HTV colours" because of method-key casing or legacy profile IDs.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from classic_htv_colour_seed import CLASSIC_HTV_COLOUR_IDS
from glitter_htv_colour_seed import GLITTER_HTV_COLOUR_IDS
from glow_htv_colour_seed import GLOW_ACTIVE_COLOUR_IDS, GLOW_HTV_COLOUR_IDS
from metallic_htv_colour_seed import METALLIC_HTV_COLOUR_IDS
from outsourced_production_rates import profile_key_for_record
from puff_htv_colour_seed import PUFF_HTV_COLOUR_IDS
from seed_production_operations import normalize_method_key


HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION = "2026-08-06-htv-profile-colours-v2"

PROFILE_RANGES: Dict[str, Dict[str, Tuple[str, ...]]] = {
    "classic_htv": {
        "supported": tuple(CLASSIC_HTV_COLOUR_IDS),
        "available": tuple(CLASSIC_HTV_COLOUR_IDS),
    },
    "glitter_htv": {
        "supported": tuple(GLITTER_HTV_COLOUR_IDS),
        "available": tuple(GLITTER_HTV_COLOUR_IDS),
    },
    "puff_htv": {
        "supported": tuple(PUFF_HTV_COLOUR_IDS),
        "available": tuple(PUFF_HTV_COLOUR_IDS),
    },
    "metallic_htv": {
        "supported": tuple(METALLIC_HTV_COLOUR_IDS),
        "available": tuple(METALLIC_HTV_COLOUR_IDS),
    },
    "glow_htv": {
        "supported": tuple(GLOW_HTV_COLOUR_IDS),
        "available": tuple(GLOW_ACTIVE_COLOUR_IDS),
    },
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_htv_method(method: Dict[str, Any]) -> bool:
    return normalize_method_key(method.get("method_key") or method.get("internal_id")) == "htv"


def _profile_identity_text(profile: Dict[str, Any]) -> str:
    raw = " ".join(
        str(profile.get(field) or "")
        for field in (
            "id",
            "profile_id",
            "manufacturing_profile_id",
            "display_name",
            "profile_name",
            "profile_label",
            "outsourced_rate_profile_label",
            "rule_name",
            "print_method",
            "print_size",
        )
    ).lower()
    return re.sub(r"[^a-z0-9]+", "_", raw).strip("_")


def profile_range_key(profile: Dict[str, Any]) -> Optional[str]:
    """Resolve canonical, legacy and display-name profile identities consistently."""
    explicit = str(profile.get("outsourced_rate_profile_key") or "").strip().lower()
    if explicit in PROFILE_RANGES:
        return explicit

    identity = _profile_identity_text(profile)
    if "glitter" in identity:
        return "glitter_htv"
    if any(token in identity for token in ("puff", "3d_puff", "3_d_puff")):
        return "puff_htv"
    if "metallic" in identity:
        return "metallic_htv"
    if any(token in identity for token in ("glow", "glow_in_the_dark", "dark_htv")):
        return "glow_htv"
    if "classic" in identity:
        return "classic_htv"

    inferred = profile_key_for_record({**profile, "method_key": "htv"}, "htv")
    if inferred == "classic_htv":
        return None
    return inferred if inferred in PROFILE_RANGES else None


def assign_authoritative_htv_profile_colours(
    method: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Restrict every completed HTV profile while preserving unknown profiles."""
    updated = deepcopy(method)
    profiles = list(updated.get("costing_profiles") or [])
    matched: Dict[str, int] = {key: 0 for key in PROFILE_RANGES}

    for index, source in enumerate(profiles):
        key = profile_range_key(source)
        if key not in PROFILE_RANGES:
            continue
        ranges = PROFILE_RANGES[key]
        profile = deepcopy(source)
        profile["colour_selection_mode"] = "restricted"
        profile["color_selection_mode"] = "restricted"
        profile["supported_colour_ids"] = list(ranges["supported"])
        profile["available_colour_ids"] = list(ranges["available"])
        profile["stocked_colour_assignment_version"] = HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION
        profiles[index] = profile
        matched[key] += 1

    updated["costing_profiles"] = profiles
    updated["htv_profile_colour_assignment_version"] = HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION
    updated["htv_profile_colour_assignment_updated_at"] = now_iso()

    missing = [key for key, count in matched.items() if count == 0]
    duplicates = [key for key, count in matched.items() if count > 1]
    return updated, {
        "matched": matched,
        "missing": missing,
        "duplicates": duplicates,
        "restricted_profile_count": sum(matched.values()),
    }


def find_htv_method(methods: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for method in methods:
        if is_htv_method(method):
            return method
    return None


async def repair_htv_profile_colour_assignments(db) -> Dict[str, Any]:
    """Find the live HTV method by normalized identity and atomically repair profiles."""
    methods: List[Dict[str, Any]] = await db.production_methods.find({}).to_list(200)
    method = find_htv_method(methods)
    if not method:
        return {
            "version": HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION,
            "htv_method_found": False,
            "htv_method_updated": False,
            "restricted_profile_count": 0,
            "matched": {},
            "missing": list(PROFILE_RANGES),
            "duplicates": [],
        }

    repaired, summary = assign_authoritative_htv_profile_colours(method)
    method_id = repaired.pop("_id", None)
    update_fields = {
        "costing_profiles": repaired.get("costing_profiles") or [],
        "htv_profile_colour_assignment_version": HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION,
        "htv_profile_colour_assignment_updated_at": repaired["htv_profile_colour_assignment_updated_at"],
        "updated_at": now_iso(),
    }
    lookup = {"_id": method_id} if method_id is not None else {"method_key": method.get("method_key")}
    result = await db.production_methods.update_one(lookup, {"$set": update_fields})

    return {
        "version": HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION,
        "htv_method_found": True,
        "htv_method_key": method.get("method_key"),
        "htv_method_updated": bool(result.modified_count),
        **summary,
    }
