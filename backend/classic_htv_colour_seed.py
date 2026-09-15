"""Idempotent Classic HTV stocked-colour seed and profile assignment."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple


CLASSIC_HTV_COLOUR_VERSION = "2026-08-05-classic-htv-v1"
CLASSIC_HTV_PROFILE_KEY = "classic_htv"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def colour(
    colour_id: str,
    name: str,
    hex_value: str,
    *aliases: str,
    finish: str = "matt",
) -> Dict[str, Any]:
    return {
        "id": colour_id,
        "name": name,
        "hex": hex_value.upper(),
        "aliases": list(dict.fromkeys([name.lower(), *[alias.lower() for alias in aliases if alias]])),
        "active": True,
        "supplier_range": "Premium Heat Flex",
        "finish": finish,
        "source_version": CLASSIC_HTV_COLOUR_VERSION,
    }


# Hex values are representative UI swatches derived from the supplied colour chart.
# Existing IDs are retained for previously seeded colours so saved selections remain valid.
CLASSIC_HTV_COLOURS: List[Dict[str, Any]] = [
    colour("apple_green", "Apple Green", "#8BC53F", "apple"),
    colour("ardesia", "Ardesia", "#707372", "charcoal grey", "dark grey"),
    colour("baby_blue", "Baby Blue", "#A9D8EF", "light blue"),
    colour("black", "Black", "#000000", "swart"),
    colour("blue_neon", "Blue Neon", "#00AFD7", "neon blue"),
    colour("brown", "Brown", "#4B2E24", "dark brown"),
    colour("camel_brown", "Camel Brown", "#7B5636", "camel"),
    colour("gold", "Gold", "#C69A2B", "classic gold"),
    colour("golden_yellow", "Golden Yellow", "#F6A62A", "gold yellow"),
    colour("green", "Grass Green", "#2E9B50", "green", "grass"),
    colour("green_neon", "Green Neon", "#20C522", "neon green"),
    colour("grey", "Grey", "#8D9296", "gray"),
    colour("yellow", "Lemon Yellow", "#F4DF00", "yellow", "lemon"),
    colour("lime_green", "Lime Green", "#72C442", "lime"),
    colour("military_blue", "Military Blue", "#3C5FB3", "army blue"),
    colour("navy", "Navy", "#0A3048", "navy blue"),
    colour("nut_brown", "Nut Brown", "#BE5B28", "rust brown"),
    colour("orange_neon", "Orange Neon", "#FF8628", "neon orange"),
    colour("orange", "Orange", "#F36C16", "oranje"),
    colour("pastel_purple", "Pastel Purple", "#B7B2DF", "lavender"),
    colour("pink", "Piggy Pink", "#EA8FB0", "pink", "pienk"),
    colour("pink_neon", "Pink Neon", "#FF3E9F", "neon pink"),
    colour("purple_neon", "Purple Neon", "#A330E8", "neon purple"),
    colour("purple", "Purple", "#5C2D91", "pers"),
    colour("bordeaux", "Bordeaux", "#69184F", "burgundy", "wine"),
    colour("red", "Red", "#D71920", "rooi"),
    colour("rosa_pink", "Rosa Pink", "#D63C79", "rosa"),
    colour("rose_gold", "Rose Gold", "#B77A7C", "rose-gold", finish="gloss"),
    colour("royal_blue", "Royal Blue", "#1747B0", "royal", "blue"),
    colour("sahara_brown", "Sahara Brown", "#C8A66E", "sahara", "tan"),
    colour("silver", "Silver", "#BFC2C5", "classic silver"),
    colour("white", "White", "#FFFFFF", "wit"),
    colour("yellow_neon", "Yellow Neon", "#FFE600", "neon yellow"),
]

CLASSIC_HTV_COLOUR_IDS = tuple(row["id"] for row in CLASSIC_HTV_COLOURS)


def merge_colour_pool(existing: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge the supplier range into a method pool without deleting custom colours."""
    canonical = {row["id"]: deepcopy(row) for row in CLASSIC_HTV_COLOURS}
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
    for colour_id in CLASSIC_HTV_COLOUR_IDS:
        if colour_id not in seen:
            result.append(deepcopy(canonical[colour_id]))
    return result


def is_classic_htv_profile(profile: Dict[str, Any]) -> bool:
    explicit = str(profile.get("outsourced_rate_profile_key") or "").strip().lower()
    if explicit == CLASSIC_HTV_PROFILE_KEY:
        return True
    values = " ".join(
        str(profile.get(field) or "")
        for field in ("id", "profile_id", "manufacturing_profile_id", "display_name", "profile_name", "profile_label")
    ).lower()
    return "classic" in values and "htv" in values


def assign_classic_profile_colours(method: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """Restrict Classic HTV to the supplied range while leaving other profiles unchanged."""
    updated = deepcopy(method)
    profiles = list(updated.get("costing_profiles") or [])
    matched = False
    for index, profile in enumerate(profiles):
        if not is_classic_htv_profile(profile):
            continue
        row = deepcopy(profile)
        row["colour_selection_mode"] = "restricted"
        row["color_selection_mode"] = "restricted"
        row["supported_colour_ids"] = list(CLASSIC_HTV_COLOUR_IDS)
        row["available_colour_ids"] = list(CLASSIC_HTV_COLOUR_IDS)
        row["stocked_colour_seed_version"] = CLASSIC_HTV_COLOUR_VERSION
        profiles[index] = row
        matched = True
    updated["costing_profiles"] = profiles
    supported = deepcopy(updated.get("supported_colours") or {})
    supported["mode"] = "restricted_library"
    supported["library_id"] = supported.get("library_id") or "default-stocked-vinyl-colours"
    supported["colours"] = merge_colour_pool(supported.get("colours") or [])
    updated["supported_colours"] = supported
    return updated, matched


async def seed_classic_htv_colours(db) -> Dict[str, Any]:
    """Upsert colours, extend the HTV method pool and assign Classic HTV profile colours."""
    await db.stocked_colours.create_index("id", unique=True)
    now = now_iso()
    inserted = 0
    updated_count = 0

    for source in CLASSIC_HTV_COLOURS:
        document = deepcopy(source)
        document["updated_at"] = now
        result = await db.stocked_colours.update_one(
            {"id": document["id"]},
            {
                "$set": document,
                "$setOnInsert": {"created_at": now},
            },
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
        merged_method, profile_matched = assign_classic_profile_colours(method)
        merged_method["updated_at"] = now
        merged_method["classic_htv_colour_seed_version"] = CLASSIC_HTV_COLOUR_VERSION
        result = await db.production_methods.update_one(
            {"method_key": "htv"},
            {"$set": merged_method},
        )
        method_updated = bool(result.modified_count)

    return {
        "version": CLASSIC_HTV_COLOUR_VERSION,
        "colour_count": len(CLASSIC_HTV_COLOURS),
        "inserted": inserted,
        "updated": updated_count,
        "htv_method_found": bool(method),
        "htv_method_updated": method_updated,
        "classic_profile_matched": profile_matched,
    }
