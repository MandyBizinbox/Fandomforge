"""Idempotent Metallic HTV stocked-colour seed and profile assignment."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple


METALLIC_HTV_COLOUR_VERSION = "2026-08-05-metallic-htv-v1"
METALLIC_HTV_PROFILE_KEY = "metallic_htv"
METALLIC_SUPPLIER_RANGE = "Metallic Heat Flex"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def colour(colour_id: str, name: str, hex_value: str, *aliases: str) -> Dict[str, Any]:
    return {
        "id": colour_id,
        "name": name,
        "hex": hex_value.upper(),
        "aliases": list(dict.fromkeys([name.lower(), *[alias.lower() for alias in aliases if alias]])),
        "active": True,
        "supplier_range": METALLIC_SUPPLIER_RANGE,
        "finish": "metallic",
        "source_version": METALLIC_HTV_COLOUR_VERSION,
    }


# Metallic colours use profile-specific IDs so Red and Metallic Red remain
# separate manufacturing selections even though they share a base hue.
METALLIC_HTV_COLOURS: List[Dict[str, Any]] = [
    colour("metallic_red", "Metallic Red", "#A8222B", "red metallic"),
    colour("metallic_green", "Metallic Green", "#2F745B", "green metallic"),
    colour("metallic_silver_chrome", "Metallic Silver / Chrome", "#B8BEC4", "silver chrome", "chrome"),
    colour("metallic_gold", "Metallic Gold", "#A68A35", "gold metallic"),
    colour("metallic_purple", "Metallic Purple", "#65447E", "purple metallic"),
    colour("metallic_smokey_grey", "Metallic Smokey Grey", "#696A6B", "smokey grey", "smoky grey"),
]

METALLIC_HTV_COLOUR_IDS = tuple(row["id"] for row in METALLIC_HTV_COLOURS)


def merge_colour_pool(existing: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add Metallic colours to the HTV method pool without deleting custom entries."""
    canonical = {row["id"]: deepcopy(row) for row in METALLIC_HTV_COLOURS}
    result: List[Dict[str, Any]] = []
    seen = set()
    for raw in existing or []:
        row = deepcopy(raw)
        colour_id = str(row.get("id") or "").strip()
        if not colour_id or colour_id in seen:
            continue
        if colour_id in canonical:
            merged = {**row, **canonical[colour_id]}
            merged["aliases"] = list(dict.fromkeys([*(row.get("aliases") or []), *canonical[colour_id]["aliases"]]))
            row = merged
        result.append(row)
        seen.add(colour_id)
    for colour_id in METALLIC_HTV_COLOUR_IDS:
        if colour_id not in seen:
            result.append(deepcopy(canonical[colour_id]))
    return result


def is_metallic_htv_profile(profile: Dict[str, Any]) -> bool:
    explicit = str(profile.get("outsourced_rate_profile_key") or "").strip().lower()
    if explicit == METALLIC_HTV_PROFILE_KEY:
        return True
    values = " ".join(
        str(profile.get(field) or "")
        for field in ("id", "profile_id", "manufacturing_profile_id", "display_name", "profile_name", "profile_label")
    ).lower()
    return "metallic" in values and "htv" in values


def assign_metallic_profile_colours(method: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """Restrict Metallic HTV to its six supplier colours."""
    updated = deepcopy(method)
    profiles = list(updated.get("costing_profiles") or [])
    matched = False
    for index, profile in enumerate(profiles):
        if not is_metallic_htv_profile(profile):
            continue
        row = deepcopy(profile)
        row["colour_selection_mode"] = "restricted"
        row["color_selection_mode"] = "restricted"
        row["supported_colour_ids"] = list(METALLIC_HTV_COLOUR_IDS)
        row["available_colour_ids"] = list(METALLIC_HTV_COLOUR_IDS)
        row["stocked_colour_seed_version"] = METALLIC_HTV_COLOUR_VERSION
        profiles[index] = row
        matched = True
    updated["costing_profiles"] = profiles

    supported = deepcopy(updated.get("supported_colours") or {})
    supported["mode"] = "restricted_library"
    supported["library_id"] = supported.get("library_id") or "default-stocked-vinyl-colours"
    supported["colours"] = merge_colour_pool(supported.get("colours") or [])
    updated["supported_colours"] = supported
    return updated, matched


async def seed_metallic_htv_colours(db) -> Dict[str, Any]:
    """Upsert Metallic colours, extend the HTV pool and assign the Metallic profile."""
    await db.stocked_colours.create_index("id", unique=True)
    now = now_iso()
    inserted = 0
    updated_count = 0

    for source in METALLIC_HTV_COLOURS:
        document = deepcopy(source)
        document["updated_at"] = now
        result = await db.stocked_colours.update_one(
            {"id": document["id"]},
            {"$set": document, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if result.upserted_id is not None:
            inserted += 1
        elif result.modified_count:
            updated_count += 1

    method = await db.production_methods.find_one({"method_key": "htv"}, {"_id": 0})
    profile_matched = False
    method_updated = False
    if method:
        merged_method, profile_matched = assign_metallic_profile_colours(method)
        merged_method["updated_at"] = now
        merged_method["metallic_htv_colour_seed_version"] = METALLIC_HTV_COLOUR_VERSION
        result = await db.production_methods.update_one({"method_key": "htv"}, {"$set": merged_method})
        method_updated = bool(result.modified_count)

    return {
        "version": METALLIC_HTV_COLOUR_VERSION,
        "colour_count": len(METALLIC_HTV_COLOURS),
        "inserted": inserted,
        "updated": updated_count,
        "htv_method_found": bool(method),
        "htv_method_updated": method_updated,
        "metallic_profile_matched": profile_matched,
    }
