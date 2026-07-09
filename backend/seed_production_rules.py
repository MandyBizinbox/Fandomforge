"""Configurable production method rules for FandomForge Builder V2.

These defaults seed the launch manufacturing rules engine. They are inserted with
$setOnInsert so future admin edits remain authoritative and do not require code
changes.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from seed_production_operations import normalize_method_key


PRODUCTION_RULES_VERSION = "2026-07-builder-v2-production-rules-v1"


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


DEFAULT_STOCKED_COLOURS: List[Dict[str, Any]] = [
    {"id": "white", "name": "White", "hex": "#FFFFFF", "aliases": ["white", "wit"], "active": True},
    {"id": "black", "name": "Black", "hex": "#000000", "aliases": ["black", "swart"], "active": True},
    {"id": "red", "name": "Red", "hex": "#D0021B", "aliases": ["red", "rooi"], "active": True},
    {"id": "royal_blue", "name": "Royal Blue", "hex": "#0057B8", "aliases": ["blue", "royal", "royal blue"], "active": True},
    {"id": "navy", "name": "Navy", "hex": "#001F3F", "aliases": ["navy", "navy blue"], "active": True},
    {"id": "gold", "name": "Gold", "hex": "#D4AF37", "aliases": ["gold"], "active": True},
    {"id": "silver", "name": "Silver", "hex": "#C0C0C0", "aliases": ["silver"], "active": True},
    {"id": "green", "name": "Green", "hex": "#00843D", "aliases": ["green", "groen"], "active": True},
    {"id": "yellow", "name": "Yellow", "hex": "#FFD100", "aliases": ["yellow", "geel"], "active": True},
    {"id": "pink", "name": "Pink", "hex": "#FF4FA3", "aliases": ["pink", "pienk"], "active": True},
    {"id": "orange", "name": "Orange", "hex": "#FF6A00", "aliases": ["orange", "oranje"], "active": True},
    {"id": "purple", "name": "Purple", "hex": "#6F2DBD", "aliases": ["purple", "pers"], "active": True},
]


def stocked_colour_library() -> Dict[str, Any]:
    return {
        "mode": "restricted_library",
        "library_id": "default-stocked-vinyl-colours",
        "description": "Creator may only use colours that exist in stocked HTV / adhesive vinyl inventory.",
        "colours": DEFAULT_STOCKED_COLOURS,
    }


def unlimited_colour_support() -> Dict[str, Any]:
    return {
        "mode": "unlimited_rgb",
        "library_id": None,
        "description": "Full RGB artwork accepted. Colour complexity does not create extra material layers.",
        "colours": [],
    }


COMMON_ARTWORK_TYPES = ["png", "jpg", "jpeg", "svg", "vector", "text", "shape"]
FABRIC_MATERIALS = ["cotton", "polyester", "cotton_blend", "polyester_blend", "fabric"]
HARD_SURFACE_MATERIALS = ["ceramic", "glass", "metal", "acrylic", "plastic", "polymer_coated", "hard_surface"]
APPAREL_CATEGORIES = ["apparel", "shirt", "t_shirt", "t-shirt", "tee", "hoodie", "sweater", "baby_grow", "onesie", "cap", "bag"]
HARD_SURFACE_CATEGORIES = ["mug", "tumbler", "bottle", "keyring", "sticker", "decal", "signage", "hard_surface", "gift"]


DEFAULT_METHOD_RULES: List[Dict[str, Any]] = [
    {
        "id": "method-dtf",
        "internal_id": "dtf",
        "method_key": "dtf",
        "display_name": "DTF Transfer",
        "description": "Full-colour DTF transfer for fabric products. Multiple colours are produced as one transfer and normally require one press per placement.",
        "active": True,
        "default_production_lead_time_days": 2,
        "supported_product_categories": APPAREL_CATEGORIES,
        "supported_materials": FABRIC_MATERIALS,
        "supported_colours": unlimited_colour_support(),
        "supported_artwork_types": COMMON_ARTWORK_TYPES,
        "maximum_artwork_width_mm": 320,
        "maximum_artwork_height_mm": 420,
        "minimum_artwork_width_mm": 10,
        "minimum_artwork_height_mm": 10,
        "minimum_resolution_dpi": 300,
        "transparent_background_required": True,
        "mirror_artwork_required": False,
        "gang_sheet_capable": True,
        "layer_behaviour": {"model": "single_transfer", "colour_creates_layer": False, "default_layers": 1},
        "press_behaviour": {"model": "one_press_per_print_area", "operation_type": "heat_press", "presses_per_area": 1, "seconds_per_press": 15, "cost_per_press": 8.0, "combine_same_area": True},
        "cost_calculation_model": {"model": "area_or_sheet_transfer", "raw_cost_source": "print_option", "supports_gang_sheet": True},
        "creator_restrictions": {"colour_picker": "rgb", "requires_stocked_colour_selection": False},
        "validation_rules": {"enforce_print_area_boundary": True, "enforce_material_compatibility": True, "enforce_colour_library": False},
    },
    {
        "id": "method-sublimation",
        "internal_id": "sublimation",
        "method_key": "sublimation",
        "display_name": "Sublimation",
        "description": "Full-colour sublimation for polyester or polymer-coated products. Artwork is combined into one print per printable area.",
        "active": True,
        "default_production_lead_time_days": 2,
        "supported_product_categories": [*APPAREL_CATEGORIES, *HARD_SURFACE_CATEGORIES],
        "supported_materials": ["polyester", "polyester_blend", "polymer_coated", "ceramic", "hard_surface"],
        "supported_colours": unlimited_colour_support(),
        "supported_artwork_types": COMMON_ARTWORK_TYPES,
        "maximum_artwork_width_mm": 600,
        "maximum_artwork_height_mm": 1000,
        "minimum_artwork_width_mm": 10,
        "minimum_artwork_height_mm": 10,
        "minimum_resolution_dpi": 300,
        "transparent_background_required": False,
        "mirror_artwork_required": True,
        "gang_sheet_capable": True,
        "layer_behaviour": {"model": "single_print", "colour_creates_layer": False, "default_layers": 1},
        "press_behaviour": {"model": "one_press_per_print_area", "operation_type": "heat_press", "presses_per_area": 1, "seconds_per_press": 60, "cost_per_press": 10.0, "combine_same_area": True},
        "cost_calculation_model": {"model": "area_or_sheet_sublimation", "raw_cost_source": "print_option", "supports_gang_sheet": True},
        "creator_restrictions": {"colour_picker": "rgb", "requires_stocked_colour_selection": False},
        "validation_rules": {"enforce_print_area_boundary": True, "enforce_material_compatibility": True, "enforce_colour_library": False},
    },
    {
        "id": "method-htv",
        "internal_id": "htv",
        "method_key": "htv",
        "display_name": "HTV",
        "description": "Heat transfer vinyl. Every stocked colour is a separate material layer, weed step and press operation.",
        "active": True,
        "default_production_lead_time_days": 3,
        "supported_product_categories": APPAREL_CATEGORIES,
        "supported_materials": FABRIC_MATERIALS,
        "supported_colours": stocked_colour_library(),
        "supported_artwork_types": ["svg", "vector", "text", "shape", "png"],
        "maximum_artwork_width_mm": 300,
        "maximum_artwork_height_mm": 380,
        "minimum_artwork_width_mm": 8,
        "minimum_artwork_height_mm": 8,
        "minimum_resolution_dpi": 300,
        "transparent_background_required": True,
        "mirror_artwork_required": True,
        "gang_sheet_capable": False,
        "layer_behaviour": {"model": "colour_layers", "colour_creates_layer": True, "default_layers": 1, "max_layers": 4},
        "press_behaviour": {"model": "one_press_per_layer", "operation_type": "heat_press", "presses_per_layer": 1, "seconds_per_press": 12, "cost_per_press": 8.0, "combine_same_area": False},
        "cost_calculation_model": {"model": "material_per_colour_layer", "raw_cost_source": "print_option", "layer_multiplier_applies": True},
        "creator_restrictions": {"colour_picker": "stocked_library", "requires_stocked_colour_selection": True},
        "validation_rules": {"enforce_print_area_boundary": True, "enforce_material_compatibility": True, "enforce_colour_library": True, "max_layers_enforced": True},
    },
    {
        "id": "method-uv-dtf",
        "internal_id": "uv_dtf",
        "method_key": "uv_dtf",
        "display_name": "UV DTF",
        "description": "Full-colour UV DTF transfer for hard surfaces. Artwork complexity remains one transfer per application area.",
        "active": True,
        "default_production_lead_time_days": 3,
        "supported_product_categories": HARD_SURFACE_CATEGORIES,
        "supported_materials": HARD_SURFACE_MATERIALS,
        "supported_colours": unlimited_colour_support(),
        "supported_artwork_types": COMMON_ARTWORK_TYPES,
        "maximum_artwork_width_mm": 300,
        "maximum_artwork_height_mm": 420,
        "minimum_artwork_width_mm": 8,
        "minimum_artwork_height_mm": 8,
        "minimum_resolution_dpi": 300,
        "transparent_background_required": True,
        "mirror_artwork_required": False,
        "gang_sheet_capable": True,
        "layer_behaviour": {"model": "single_transfer", "colour_creates_layer": False, "default_layers": 1},
        "press_behaviour": {"model": "one_application_per_print_area", "operation_type": "application", "presses_per_area": 1, "seconds_per_press": 30, "cost_per_press": 7.0, "combine_same_area": True},
        "cost_calculation_model": {"model": "sheet_transfer_application", "raw_cost_source": "print_option", "supports_gang_sheet": True},
        "creator_restrictions": {"colour_picker": "rgb", "requires_stocked_colour_selection": False},
        "validation_rules": {"enforce_print_area_boundary": True, "enforce_material_compatibility": True, "enforce_colour_library": False},
    },
    {
        "id": "method-adhesive-vinyl",
        "internal_id": "adhesive_vinyl",
        "method_key": "adhesive_vinyl",
        "display_name": "Adhesive Vinyl",
        "description": "Cut adhesive vinyl for hard surfaces. Every stocked vinyl colour creates a material layer, cut, weed and application step.",
        "active": True,
        "default_production_lead_time_days": 3,
        "supported_product_categories": ["sticker", "decal", "signage", "bottle", "hard_surface", "gift"],
        "supported_materials": ["glass", "metal", "plastic", "acrylic", "ceramic", "hard_surface"],
        "supported_colours": stocked_colour_library(),
        "supported_artwork_types": ["svg", "vector", "text", "shape", "png"],
        "maximum_artwork_width_mm": 300,
        "maximum_artwork_height_mm": 600,
        "minimum_artwork_width_mm": 8,
        "minimum_artwork_height_mm": 8,
        "minimum_resolution_dpi": 300,
        "transparent_background_required": True,
        "mirror_artwork_required": False,
        "gang_sheet_capable": False,
        "layer_behaviour": {"model": "colour_layers", "colour_creates_layer": True, "default_layers": 1, "max_layers": 4},
        "press_behaviour": {"model": "one_application_per_layer", "operation_type": "application", "presses_per_layer": 1, "seconds_per_press": 30, "cost_per_press": 6.0, "combine_same_area": False},
        "cost_calculation_model": {"model": "vinyl_usage_plus_cut_weed_apply", "raw_cost_source": "print_option", "layer_multiplier_applies": True},
        "creator_restrictions": {"colour_picker": "stocked_library", "requires_stocked_colour_selection": True},
        "validation_rules": {"enforce_print_area_boundary": True, "enforce_material_compatibility": True, "enforce_colour_library": True, "max_layers_enforced": True},
    },
]


DEFAULT_PRODUCTION_SETTINGS: Dict[str, Any] = {
    "id": "default",
    "version": PRODUCTION_RULES_VERSION,
    "active": True,
    "default_packaging_cost": 2.50,
    "default_packaging_creator_markup_percent": 10,
    "default_additional_manufacturing_charges": [],
    "fail_publish_on_warnings": False,
    "allow_unknown_material_with_warning": True,
    "allow_unknown_category_with_warning": True,
    "minimum_creator_profit_required": 0,
    "notes": "Launch defaults. Admin-editable production settings are stored in MongoDB, not hard-coded in the Builder.",
}


async def seed_production_rules(db) -> Dict[str, int]:
    """Insert default method rules, stocked colours and settings idempotently."""
    await db.production_methods.create_index("id", unique=True)
    await db.production_methods.create_index("method_key", unique=True)
    await db.production_methods.create_index("active")
    await db.stocked_colours.create_index("id", unique=True)
    await db.stocked_colours.create_index("active")
    await db.production_rule_settings.create_index("id", unique=True)

    now = utcnow_iso()
    inserted_methods = 0
    inserted_colours = 0
    inserted_settings = 0

    for rule in DEFAULT_METHOD_RULES:
        doc = dict(rule)
        doc["method_key"] = normalize_method_key(doc.get("method_key") or doc.get("internal_id"))
        doc.setdefault("id", f"method-{doc['method_key'].replace('_', '-')}")
        doc.setdefault("version", PRODUCTION_RULES_VERSION)
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await db.production_methods.update_one(
            {"method_key": doc["method_key"]},
            {"$setOnInsert": doc},
            upsert=True,
        )
        if result.upserted_id is not None:
            inserted_methods += 1

    for colour in DEFAULT_STOCKED_COLOURS:
        doc = dict(colour)
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await db.stocked_colours.update_one(
            {"id": doc["id"]},
            {"$setOnInsert": doc},
            upsert=True,
        )
        if result.upserted_id is not None:
            inserted_colours += 1

    settings_doc = dict(DEFAULT_PRODUCTION_SETTINGS)
    settings_doc["created_at"] = now
    settings_doc["updated_at"] = now
    result = await db.production_rule_settings.update_one(
        {"id": "default"},
        {"$setOnInsert": settings_doc},
        upsert=True,
    )
    if result.upserted_id is not None:
        inserted_settings += 1

    return {
        "inserted_methods": inserted_methods,
        "inserted_colours": inserted_colours,
        "inserted_settings": inserted_settings,
        "method_defaults": len(DEFAULT_METHOD_RULES),
        "colour_defaults": len(DEFAULT_STOCKED_COLOURS),
    }
