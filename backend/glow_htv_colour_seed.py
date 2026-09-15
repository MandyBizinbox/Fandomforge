"""Idempotent Glow-in-the-Dark HTV stocked-colour seed and profile assignment."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple


GLOW_HTV_COLOUR_VERSION = "2026-08-05-glow-htv-v1"
GLOW_HTV_PROFILE_KEY = "glow_htv"
GLOW_SUPPLIER_RANGE = "Glow in the Dark HTV"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def colour(
    colour_id: str,
    name: str,
    hex_value: str,
    *aliases: str,
    active: bool = True,
    availability_status: str = "available",
) -> Dict[str, Any]:
    return {
        "id": colour_id,
        "name": name,
        "hex": hex_value.upper(),
        "aliases": list(dict.fromkeys([name.lower(), *[alias.lower() for alias in aliases if alias]])),
        "active": active,
        "availability_status": availability_status,
        "supplier_range": GLOW_SUPPLIER_RANGE,
        "finish": "glow_in_the_dark",
        "source_version": GLOW_HTV_COLOUR_VERSION,
    }


GLOW_HTV_COLOURS: List[Dict[str, Any]] = [
    colour("glow_fluo_blue", "Fluo Blue", "#36A9E1", "fluorescent blue"),
    colour("glow_fluo_green", "Fluo Green", "#39C64A", "fluorescent green"),
    colour("glow_fluo_orange", "Fluo Orange", "#FF7E28", "fluorescent orange"),
    colour(
        "glow_fluo_pink",
        "Fluo Pink",
        "#FF5BA7",
        "fluorescent pink",
        active=False,
        availability_status="sold_out",
    ),
    colour("glow_fluo_yellow", "Fluo Yellow", "#E8F236", "fluorescent yellow"),
    colour("glow_lime", "Lime", "#A8D94A", "lime glow"),
]

GLOW_HTV_COLOUR_IDS = tuple(row["id"] for row in GLOW_HTV_COLOURS)
GLOW_ACTIVE_COLOUR_IDS = tuple(row["id"] for row in GLOW_HTV_COLOURS if row["active"])


def merge_colour_pool(existing: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add Glow colours to the HTV method pool without deleting custom entries."""
    canonical = {row["id"]: deepcopy(row) for row in GLOW_HTV_COLOURS}
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
    for colour_id in GLOW_HTV_COLOUR_IDS:
        if colour_id not in seen:
            result.append(deepcopy(canonical[colour_id]))
    return result


def is_glow_htv_profile(profile: Dict[str, Any]) -> bool:
    explicit = str(profile.get("outsourced_rate_profile_key") or "").strip().lower()
    if explicit == GLOW_HTV_PROFILE_KEY:
        return True
    values = " ".join(
        str(profile.get(field) or "")
        for field in ("id", "profile_id", "manufacturing_profile_id", "display_name", "profile_name", "profile_label")
    ).lower()
    return "glow" in values and "htv" in values


def assign_glow_profile_colours(method: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """Restrict Glow HTV to its six supplier colours; sold-out colours remain inactive."""
    updated = deepcopy(method)
    profiles = list(updated.get("costing_profiles") or [])
    matched = False
    for index, profile in enumerate(profiles):
        if not is_glow_htv_profile(profile):
            continue
        row = deepcopy(profile)
        row["colour_selection_mode"] = "restricted"
        row["color_selection_mode"] = "restricted"
        row["supported_colour_ids"] = list(GLOW_HTV_COLOUR_IDS)
        row["available_colour_ids"] = list(GLOW_ACTIVE_COLOUR_IDS)
        row["stocked_colour_seed_version"] = GLOW_HTV_COLOUR_VERSION
        profiles[index] = row
        matched = True
    updated["costing_profiles"] = profiles

    supported = deepcopy(updated.get("supported_colours") or {})
    supported["mode"] = "restricted_library"
    supported["library_id"] = supported.get("library_id") or "default-stocked-vinyl-colours"
    supported["colours"] = merge_colour_pool(supported.get("colours") or [])
    updated["supported_colours"] = supported
    return updated, matched


async def seed_glow_htv_colours(db) -> Dict[str, Any]:
    """Upsert Glow colours, extend the HTV pool and assign the Glow profile."""
    await db.stocked_colours.create_index("id", unique=True)
    now = now_iso()
    inserted = 0
    updated_count = 0

    for source in GLOW_HTV_COLOURS:
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
        merged_method, profile_matched = assign_glow_profile_colours(method)
        merged_method["updated_at"] = now
        merged_method["glow_htv_colour_seed_version"] = GLOW_HTV_COLOUR_VERSION
        result = await db.production_methods.update_one({"method_key": "htv"}, {"$set": merged_method})
        method_updated = bool(result.modified_count)

    return {
        "version": GLOW_HTV_COLOUR_VERSION,
        "colour_count": len(GLOW_HTV_COLOURS),
        "active_colour_count": len(GLOW_ACTIVE_COLOUR_IDS),
        "sold_out_colour_count": len(GLOW_HTV_COLOURS) - len(GLOW_ACTIVE_COLOUR_IDS),
        "inserted": inserted,
        "updated": updated_count,
        "htv_method_found": bool(method),
        "htv_method_updated": method_updated,
        "glow_profile_matched": profile_matched,
    }
