"""Idempotent Glitter HTV stocked-colour seed and profile assignment."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple


GLITTER_HTV_COLOUR_VERSION = "2026-08-06-glitter-htv-v1"
GLITTER_HTV_PROFILE_KEY = "glitter_htv"
GLITTER_SUPPLIER_RANGE = "Glitter Heatflex"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def colour(colour_id: str, name: str, hex_value: str, *aliases: str) -> Dict[str, Any]:
    return {
        "id": colour_id,
        "name": name,
        "hex": hex_value.upper(),
        "aliases": list(dict.fromkeys([name.lower(), *[alias.lower() for alias in aliases if alias]])),
        "active": True,
        "supplier_range": GLITTER_SUPPLIER_RANGE,
        "finish": "glitter",
        "source_version": GLITTER_HTV_COLOUR_VERSION,
    }


# Glitter uses profile-specific IDs so standard, Metallic, Mirror and Glitter
# colours remain distinct manufacturing selections even when the base hue matches.
GLITTER_HTV_COLOURS: List[Dict[str, Any]] = [
    colour("glitter_aqua", "Glitter Aqua", "#5BC4C7", "aqua glitter"),
    colour("glitter_blue", "Glitter Blue", "#2C6DB2", "blue glitter"),
    colour("glitter_navy_blue", "Glitter Navy Blue", "#1C2D59", "navy glitter"),
    colour("glitter_royal_blue", "Glitter Royal Blue", "#2453A6", "royal blue glitter"),
    colour("glitter_gold", "Glitter Gold", "#C9A227", "gold glitter"),
    colour("glitter_rose_gold", "Glitter Rose Gold", "#B9828C", "rose gold glitter"),
    colour("glitter_purple", "Glitter Purple", "#70489A", "purple glitter"),
    colour("glitter_grey", "Glitter Grey", "#7F858A", "gray glitter"),
    colour("glitter_green", "Glitter Green", "#2E9B50", "green glitter"),
    colour("glitter_red", "Glitter Red", "#C72E35", "red glitter"),
    colour("glitter_jade", "Glitter Jade", "#2A8B75", "jade glitter"),
    colour("glitter_emerald", "Glitter Emerald", "#2A8A3A", "emerald glitter"),
    colour("glitter_blue_aqua", "Glitter Blue Aqua", "#25B8C9", "blue aqua glitter"),
    colour("glitter_black_purple", "Glitter Black Purple", "#251724", "black purple glitter"),
    colour("glitter_hot_pink", "Glitter Hot Pink", "#E4148D", "hot pink glitter"),
    colour("glitter_purple_rainbow", "Glitter Purple Rainbow", "#74478E", "purple rainbow glitter"),
    colour("glitter_black", "Glitter Black", "#111111", "black glitter"),
    colour("glitter_neon_blue", "Glitter Neon Blue", "#00AEEF", "neon blue glitter"),
    colour("glitter_ocean_green", "Glitter Ocean Green", "#137F7A", "ocean green glitter"),
    colour("glitter_neon_pink", "Glitter Neon Pink", "#FF3F9E", "neon pink glitter"),
    colour("glitter_white_stardust", "Glitter White Stardust", "#F7F7F4", "white stardust", "stardust white"),
    colour("glitter_neon_yellow", "Glitter Neon Yellow", "#F5EC22", "neon yellow glitter"),
]

GLITTER_HTV_COLOUR_IDS = tuple(row["id"] for row in GLITTER_HTV_COLOURS)


def merge_colour_pool(existing: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add Glitter colours to the HTV method pool without deleting custom entries."""
    canonical = {row["id"]: deepcopy(row) for row in GLITTER_HTV_COLOURS}
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
    for colour_id in GLITTER_HTV_COLOUR_IDS:
        if colour_id not in seen:
            result.append(deepcopy(canonical[colour_id]))
    return result


def is_glitter_htv_profile(profile: Dict[str, Any]) -> bool:
    explicit = str(profile.get("outsourced_rate_profile_key") or "").strip().lower()
    if explicit == GLITTER_HTV_PROFILE_KEY:
        return True
    values = " ".join(
        str(profile.get(field) or "")
        for field in ("id", "profile_id", "manufacturing_profile_id", "display_name", "profile_name", "profile_label")
    ).lower()
    return "glitter" in values and "htv" in values


def assign_glitter_profile_colours(method: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """Restrict Glitter HTV to its 22 supplier colours."""
    updated = deepcopy(method)
    profiles = list(updated.get("costing_profiles") or [])
    matched = False
    for index, profile in enumerate(profiles):
        if not is_glitter_htv_profile(profile):
            continue
        row = deepcopy(profile)
        row["colour_selection_mode"] = "restricted"
        row["color_selection_mode"] = "restricted"
        row["supported_colour_ids"] = list(GLITTER_HTV_COLOUR_IDS)
        row["available_colour_ids"] = list(GLITTER_HTV_COLOUR_IDS)
        row["stocked_colour_seed_version"] = GLITTER_HTV_COLOUR_VERSION
        profiles[index] = row
        matched = True
    updated["costing_profiles"] = profiles

    supported = deepcopy(updated.get("supported_colours") or {})
    supported["mode"] = "restricted_library"
    supported["library_id"] = supported.get("library_id") or "default-stocked-vinyl-colours"
    supported["colours"] = merge_colour_pool(supported.get("colours") or [])
    updated["supported_colours"] = supported
    return updated, matched


async def seed_glitter_htv_colours(db) -> Dict[str, Any]:
    """Upsert Glitter colours, extend the HTV pool and assign the Glitter profile."""
    await db.stocked_colours.create_index("id", unique=True)
    now = now_iso()
    inserted = 0
    updated_count = 0

    for source in GLITTER_HTV_COLOURS:
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

    methods = await db.production_methods.find({}).to_list(200)
    method = next(
        (row for row in methods if str(row.get("method_key") or row.get("internal_id") or "").strip().lower() == "htv"),
        None,
    )
    profile_matched = False
    method_updated = False
    if method:
        merged_method, profile_matched = assign_glitter_profile_colours(method)
        method_id = merged_method.pop("_id", None)
        merged_method["updated_at"] = now
        merged_method["glitter_htv_colour_seed_version"] = GLITTER_HTV_COLOUR_VERSION
        lookup = {"_id": method_id} if method_id is not None else {"method_key": method.get("method_key")}
        result = await db.production_methods.update_one(lookup, {"$set": merged_method})
        method_updated = bool(result.modified_count)

    return {
        "version": GLITTER_HTV_COLOUR_VERSION,
        "colour_count": len(GLITTER_HTV_COLOURS),
        "inserted": inserted,
        "updated": updated_count,
        "htv_method_found": bool(method),
        "htv_method_updated": method_updated,
        "glitter_profile_matched": profile_matched,
    }
