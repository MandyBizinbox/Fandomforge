"""Idempotent Puff HTV stocked-colour seed and profile assignment."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple


PUFF_HTV_COLOUR_VERSION = "2026-08-05-puff-htv-v1"
PUFF_HTV_PROFILE_KEY = "puff_htv"
PUFF_SUPPLIER_RANGE = "3D Puff Heat Flex"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def colour(
    colour_id: str,
    name: str,
    hex_value: str,
    *aliases: str,
    finish: str = "raised_matte",
    shared: bool = False,
) -> Dict[str, Any]:
    return {
        "id": colour_id,
        "name": name,
        "hex": hex_value.upper(),
        "aliases": list(dict.fromkeys([name.lower(), *[alias.lower() for alias in aliases if alias]])),
        "active": True,
        "supplier_range": PUFF_SUPPLIER_RANGE,
        "finish": finish,
        "shared_existing_colour": shared,
        "source_version": PUFF_HTV_COLOUR_VERSION,
    }


# Existing IDs are reused for normal Puff colours. Mirror Metallic colours use
# their own IDs so Black and Mirror Black (and Red/Mirror Red) remain distinct.
PUFF_HTV_COLOURS: List[Dict[str, Any]] = [
    colour("black", "Black", "#000000", "normal black", shared=True),
    colour("grey", "Grey", "#93989D", "gray", shared=True),
    colour("red", "Red", "#E31B23", "normal red", shared=True),
    colour("white", "White", "#FFFFFF", shared=True),
    colour("blue_neon", "Neon Blue", "#21A8E0", "blue neon", shared=True),
    colour("green_neon", "Neon Green", "#2EC43A", "green neon", shared=True),
    colour("orange_neon", "Neon Orange", "#FF8628", "orange neon", shared=True),
    colour("yellow_neon", "Neon Yellow", "#C8F000", "yellow neon", shared=True),
    colour("pink_neon", "Neon Pink", "#FF4AA2", "pink neon", shared=True),
    colour("mirror_blue", "Mirror Blue", "#3E8DCB", "metallic blue", finish="mirror_metallic"),
    colour("mirror_jade", "Mirror Jade", "#3D9A78", "metallic jade", finish="mirror_metallic"),
    colour("mirror_red", "Mirror Red", "#A9232A", "metallic red", finish="mirror_metallic"),
    colour("mirror_gold", "Mirror Gold", "#A28C39", "metallic gold", finish="mirror_metallic"),
    colour("mirror_dusty_pink", "Mirror Dusty Pink", "#C394A5", "dusty pink mirror", "metallic rose", finish="mirror_metallic"),
    colour("mirror_black", "Mirror Black", "#111111", "metallic black", finish="mirror_metallic"),
    colour("mirror_silver", "Mirror Silver", "#B9BEC4", "metallic silver", finish="mirror_metallic"),
]

PUFF_HTV_COLOUR_IDS = tuple(row["id"] for row in PUFF_HTV_COLOURS)
PUFF_STANDARD_COLOUR_IDS = tuple(row["id"] for row in PUFF_HTV_COLOURS if row["finish"] == "raised_matte")
PUFF_MIRROR_COLOUR_IDS = tuple(row["id"] for row in PUFF_HTV_COLOURS if row["finish"] == "mirror_metallic")


def public_colour(source: Dict[str, Any]) -> Dict[str, Any]:
    row = deepcopy(source)
    row.pop("shared_existing_colour", None)
    return row


def merge_colour_pool(existing: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add Puff colours to the HTV method pool without deleting custom colours."""
    canonical = {row["id"]: deepcopy(row) for row in PUFF_HTV_COLOURS}
    result: List[Dict[str, Any]] = []
    seen = set()
    for raw in existing or []:
        row = deepcopy(raw)
        colour_id = str(row.get("id") or "").strip()
        if not colour_id or colour_id in seen:
            continue
        if colour_id in canonical and not canonical[colour_id]["shared_existing_colour"]:
            merged = {**row, **public_colour(canonical[colour_id])}
            merged["aliases"] = list(dict.fromkeys([*(row.get("aliases") or []), *canonical[colour_id]["aliases"]]))
            row = merged
        result.append(row)
        seen.add(colour_id)
    for colour_id in PUFF_HTV_COLOUR_IDS:
        if colour_id not in seen:
            result.append(public_colour(canonical[colour_id]))
    return result


def is_puff_htv_profile(profile: Dict[str, Any]) -> bool:
    explicit = str(profile.get("outsourced_rate_profile_key") or "").strip().lower()
    if explicit == PUFF_HTV_PROFILE_KEY:
        return True
    values = " ".join(
        str(profile.get(field) or "")
        for field in ("id", "profile_id", "manufacturing_profile_id", "display_name", "profile_name", "profile_label")
    ).lower()
    return "puff" in values and "htv" in values


def assign_puff_profile_colours(method: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """Restrict Puff HTV to its normal and Mirror Metallic supplier colours."""
    updated = deepcopy(method)
    profiles = list(updated.get("costing_profiles") or [])
    matched = False
    for index, profile in enumerate(profiles):
        if not is_puff_htv_profile(profile):
            continue
        row = deepcopy(profile)
        row["colour_selection_mode"] = "restricted"
        row["color_selection_mode"] = "restricted"
        row["supported_colour_ids"] = list(PUFF_HTV_COLOUR_IDS)
        row["available_colour_ids"] = list(PUFF_HTV_COLOUR_IDS)
        row["stocked_colour_seed_version"] = PUFF_HTV_COLOUR_VERSION
        profiles[index] = row
        matched = True
    updated["costing_profiles"] = profiles
    supported = deepcopy(updated.get("supported_colours") or {})
    supported["mode"] = "restricted_library"
    supported["library_id"] = supported.get("library_id") or "default-stocked-vinyl-colours"
    supported["colours"] = merge_colour_pool(supported.get("colours") or [])
    updated["supported_colours"] = supported
    return updated, matched


async def seed_puff_htv_colours(db) -> Dict[str, Any]:
    """Upsert Puff colours, extend the HTV pool and assign the Puff profile."""
    await db.stocked_colours.create_index("id", unique=True)
    now = now_iso()
    inserted = 0
    updated_count = 0

    for source in PUFF_HTV_COLOURS:
        document = public_colour(source)
        shared = bool(source.get("shared_existing_colour"))
        document["updated_at"] = now
        if shared:
            update = {
                "$setOnInsert": {**document, "created_at": now},
                "$addToSet": {
                    "supplier_ranges": PUFF_SUPPLIER_RANGE,
                    "available_finishes": document["finish"],
                },
            }
        else:
            update = {
                "$set": document,
                "$setOnInsert": {"created_at": now},
                "$addToSet": {
                    "supplier_ranges": PUFF_SUPPLIER_RANGE,
                    "available_finishes": document["finish"],
                },
            }
        result = await db.stocked_colours.update_one({"id": document["id"]}, update, upsert=True)
        if result.upserted_id is not None:
            inserted += 1
        elif result.modified_count:
            updated_count += 1

    method = await db.production_methods.find_one({"method_key": "htv"}, {"_id": 0})
    profile_matched = False
    method_updated = False
    if method:
        merged_method, profile_matched = assign_puff_profile_colours(method)
        merged_method["updated_at"] = now
        merged_method["puff_htv_colour_seed_version"] = PUFF_HTV_COLOUR_VERSION
        result = await db.production_methods.update_one({"method_key": "htv"}, {"$set": merged_method})
        method_updated = bool(result.modified_count)

    return {
        "version": PUFF_HTV_COLOUR_VERSION,
        "colour_count": len(PUFF_HTV_COLOURS),
        "standard_colour_count": len(PUFF_STANDARD_COLOUR_IDS),
        "mirror_colour_count": len(PUFF_MIRROR_COLOUR_IDS),
        "inserted": inserted,
        "updated": updated_count,
        "htv_method_found": bool(method),
        "htv_method_updated": method_updated,
        "puff_profile_matched": profile_matched,
    }
