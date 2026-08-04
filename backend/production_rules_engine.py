"""Server-authoritative manufacturing rules engine for Builder V2."""
from __future__ import annotations

import re
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException

from platform_fee_pricing import (
    creator_amount_for_sale,
    production_fee_amount,
    total_cost_to_produce,
)
from seed_production_operations import normalize_method_key
from seed_production_rules import DEFAULT_PRODUCTION_SETTINGS, PRODUCTION_RULES_VERSION


COLOUR_FIELDS = {
    "text_color", "text_colour", "fill", "fill_color", "fill_colour", "stroke", "stroke_color", "stroke_colour",
    "shape_color", "shape_colour", "colour", "color", "vinyl_colour", "vinyl_color", "layer_colours",
    "layer_colors", "vector_fills", "shape_fills", "palette", "generated_colours", "generated_colors",
}

MATERIAL_ALIASES = {
    "cotton blend": "cotton_blend", "cotton-blend": "cotton_blend", "cotton_blend": "cotton_blend",
    "polyester blend": "polyester_blend", "polyester-blend": "polyester_blend",
    "polymer coated": "polymer_coated", "polymer-coated": "polymer_coated", "hard surface": "hard_surface",
}
CATEGORY_ALIASES = {"tshirt": "t_shirt", "t-shirt": "t_shirt", "tee": "t_shirt", "decal": "sticker"}


def money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback)


def clean_doc(doc: Optional[dict]) -> dict:
    row = dict(doc or {})
    row.pop("_id", None)
    return row


def public_rule(rule: dict) -> dict:
    return deepcopy(clean_doc(rule))


def key(value: Any) -> str:
    raw = str(value or "").strip().lower()
    raw = re.sub(r"[^a-z0-9#]+", "_", raw)
    return re.sub(r"_+", "_", raw).strip("_")


def material_key(value: Any) -> str:
    raw = str(value or "").strip().lower().replace("_", " ")
    return MATERIAL_ALIASES.get(raw, key(raw))


def category_key(value: Any) -> str:
    raw = str(value or "").strip().lower().replace("_", " ")
    return CATEGORY_ALIASES.get(raw, key(raw))


def colour_token(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if re.fullmatch(r"#[0-9a-fA-F]{3}", raw):
        return "#" + "".join(ch * 2 for ch in raw[1:]).lower()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", raw):
        return raw.lower()
    if raw.lower().startswith("rgb"):
        nums = [int(n) for n in re.findall(r"\d+", raw)[:3]]
        if len(nums) == 3 and all(0 <= n <= 255 for n in nums):
            return "#" + "".join(f"{n:02x}" for n in nums)
    token = key(raw.replace("colour", "").replace("color", ""))
    return "" if token in {"transparent", "none", "inherit", "currentcolor"} else token


def colour_library_tokens(rule: dict) -> Dict[str, dict]:
    out: Dict[str, dict] = {}
    for colour in ((rule.get("supported_colours") or {}).get("colours") or []):
        if not isinstance(colour, dict) or colour.get("active") is False:
            continue
        for candidate in [colour.get("id"), colour.get("name"), colour.get("hex"), *(colour.get("aliases") or [])]:
            token = colour_token(candidate)
            if token:
                out[token] = colour
    return out


def collect_colours(value: Any, out: List[str]) -> None:
    if value in (None, ""):
        return
    if isinstance(value, str):
        token = colour_token(value)
        if token:
            out.append(token)
        return
    if isinstance(value, dict):
        for name, nested in value.items():
            if key(name) in COLOUR_FIELDS:
                collect_colours(nested, out)
        return
    if isinstance(value, (list, tuple, set)):
        for item in value:
            collect_colours(item, out)


def slot_colours(slot: dict) -> List[str]:
    found: List[str] = []
    for name in COLOUR_FIELDS:
        if name in slot:
            collect_colours(slot.get(name), found)
    for meta_name in ("text", "design_element", "vector", "shape", "generated_graphic"):
        meta = slot.get(meta_name)
        if isinstance(meta, dict):
            collect_colours(meta, found)
    unique: List[str] = []
    for value in found:
        if value and value not in unique:
            unique.append(value)
    return unique


def option_map(template: dict, global_options: Iterable[dict]) -> dict:
    out = {str(o.get("id")): o for o in (global_options or []) if o.get("id")}
    out.update({str(o.get("id")): o for o in (template.get("print_options") or []) if o.get("id")})
    return out


def area_map(template: dict) -> dict:
    return {str(a.get("id")): a for a in (template.get("print_areas") or []) if a.get("id")}


def iter_slots(product: dict) -> List[dict]:
    seen = set()
    rows: List[dict] = []
    for group in product.get("artwork_groups") or []:
        for slot in group.get("artworks") or []:
            if isinstance(slot, dict):
                ident = slot.get("id") or f"g:{len(rows)}:{slot.get('print_area_id')}"
                if ident not in seen:
                    seen.add(ident); rows.append(slot)
    for slot in product.get("artworks") or []:
        if isinstance(slot, dict):
            ident = slot.get("id") or f"f:{len(rows)}:{slot.get('print_area_id')}"
            if ident not in seen:
                seen.add(ident); rows.append(slot)
    return rows


def sync_slots(product: dict, lookup: dict) -> None:
    for group in product.get("artwork_groups") or []:
        for slot in group.get("artworks") or []:
            if isinstance(slot, dict) and slot.get("id") in lookup:
                slot.update(lookup[slot["id"]])
    for slot in product.get("artworks") or []:
        if isinstance(slot, dict) and slot.get("id") in lookup:
            slot.update(lookup[slot["id"]])


def has_artwork(slot: dict) -> bool:
    return bool(slot.get("original_url") or slot.get("text_layer") or slot.get("text_content") or slot.get("generated_graphic"))


def method_from_slot(slot: dict, options: dict) -> str:
    opt = options.get(str(slot.get("print_option_id") or "")) or {}
    return normalize_method_key(slot.get("method_key") or slot.get("manufacturing_method_id") or slot.get("print_method") or opt.get("method_key") or opt.get("print_method") or opt.get("method"))


def allowed_area_methods(area: dict, options: dict) -> List[str]:
    explicit = area.get("supported_print_methods") or area.get("compatible_methods") or area.get("supported_methods") or []
    methods = [normalize_method_key(v) for v in explicit if normalize_method_key(v)]
    for option_id in area.get("allowed_print_option_ids") or []:
        option = options.get(str(option_id)) or {}
        method = normalize_method_key(option.get("method_key") or option.get("print_method") or option.get("method"))
        if method and method not in methods:
            methods.append(method)
    return methods


def infer_categories(product: dict, template: dict) -> List[str]:
    values = [product.get("category"), product.get("product_type"), template.get("category"), template.get("product_type"), template.get("name")]
    joined = " ".join(str(v or "") for v in values).lower()
    out: List[str] = []
    if any(t in joined for t in ["shirt", "tee", "hoodie", "apparel", "baby", "onesie"]):
        out.append("apparel")
    if any(t in joined for t in ["mug", "tumbler", "bottle", "glass", "ceramic", "sticker", "decal"]):
        out.append("hard_surface")
    for value in values:
        candidate = category_key(value)
        if candidate and candidate not in out:
            out.append(candidate)
    return out


def infer_materials(product: dict, template: dict) -> List[str]:
    raw: List[Any] = []
    for source in (product, template):
        for field in ("material", "materials", "supported_materials", "substrate", "substrates", "fabric", "composition"):
            value = source.get(field)
            raw.extend(value if isinstance(value, list) else ([value] if value else []))
    joined = " ".join(str(v or "") for v in [*raw, product.get("category"), template.get("category"), template.get("name")]).lower()
    out: List[str] = []
    if any(t in joined for t in ["cotton", "shirt", "tee", "hoodie", "apparel"]):
        out += ["cotton_blend", "fabric"]
    if "polyester" in joined or "sublimation" in joined:
        out.append("polyester")
    if any(t in joined for t in ["mug", "ceramic"]):
        out += ["ceramic", "polymer_coated"]
    if any(t in joined for t in ["glass", "bottle", "tumbler", "metal", "acrylic", "plastic"]):
        out.append("hard_surface")
    for value in raw:
        candidate = material_key(value)
        if candidate:
            out.append(candidate)
    unique: List[str] = []
    for value in out:
        if value and value not in unique:
            unique.append(value)
    return unique


def matches_supported(values: List[str], supported: List[str], group_aliases: dict) -> bool:
    if not supported:
        return True
    expanded = set(values)
    for source, aliases in group_aliases.items():
        if source in expanded or expanded.intersection(aliases):
            expanded.add(source)
    return bool(expanded.intersection(set(supported)))


def placement(slot: dict) -> Tuple[float, float, float, float]:
    row = slot.get("placement") or {}
    return number(row.get("x", row.get("x_pct", 0))), number(row.get("y", row.get("y_pct", 0))), number(row.get("width", row.get("width_pct", 100)), 100), number(row.get("height", row.get("height_pct", 100)), 100)


def dimensions(slot: dict, area: dict) -> Tuple[float, float, float, float]:
    aw = number(area.get("width_mm") or slot.get("print_area_width_mm") or slot.get("width_mm"))
    ah = number(area.get("height_mm") or slot.get("print_area_height_mm") or slot.get("height_mm"))
    iw = number(slot.get("charged_width_mm") or slot.get("print_width_mm") or slot.get("artwork_width_mm"))
    ih = number(slot.get("charged_height_mm") or slot.get("print_height_mm") or slot.get("artwork_height_mm"))
    if (iw <= 0 or ih <= 0) and aw > 0 and ah > 0:
        _, _, pw, ph = placement(slot)
        iw, ih = aw * max(pw, 0) / 100, ah * max(ph, 0) / 100
    return aw, ah, iw, ih


def artwork_type(slot: dict) -> str:
    mime = str(slot.get("mime_type") or "").lower(); name = str(slot.get("file_name") or slot.get("original_url") or "").lower()
    if slot.get("text_layer") or slot.get("text_content"): return "text"
    if "svg" in mime or name.endswith(".svg"): return "svg"
    if "png" in mime or name.endswith(".png"): return "png"
    if "jpeg" in mime or "jpg" in mime or name.endswith((".jpg", ".jpeg")): return "jpg"
    if slot.get("vector"): return "vector"
    if slot.get("shape"): return "shape"
    return "unknown"


def issue(level: str, code: str, message: str, slot: Optional[dict] = None, method_key: Optional[str] = None, meta: Optional[dict] = None) -> dict:
    return {"level": level, "code": code, "message": message, "slot_id": (slot or {}).get("id"), "print_area_id": (slot or {}).get("print_area_id"), "method_key": method_key or (slot or {}).get("method_key"), "meta": meta or {}}


async def load_method_rules(db) -> Dict[str, dict]:
    docs = await db.production_methods.find({"active": True}, {"_id": 0}).to_list(200)
    return {normalize_method_key(d.get("method_key") or d.get("internal_id")): clean_doc(d) for d in docs}


async def load_settings(db) -> dict:
    settings = dict(DEFAULT_PRODUCTION_SETTINGS)
    db_doc = await db.production_rule_settings.find_one({"id": "default"}, {"_id": 0})
    settings.update(clean_doc(db_doc))
    return settings


def cost_integrity(product: dict, settings: dict) -> dict:
    packaging = money(
        product.get("platform_packaging_cost")
        or settings.get("default_packaging_cost")
    )

    additional_platform = 0.0
    charges = []

    for charge in settings.get(
        "default_additional_manufacturing_charges"
    ) or []:
        if isinstance(charge, dict) and charge.get("active") is not False:
            platform_cost = money(
                charge.get("platform_cost") or charge.get("cost")
            )
            additional_platform += platform_cost
            charges.append({
                **charge,
                "platform_cost": platform_cost,
                "creator_price": 0.0,
                "pricing_treatment": "internal_only",
            })

    platform_blank = money(
        product.get("platform_blank_cost")
        or product.get("estimated_blank_cost")
    )
    creator_blank = money(
        product.get("creator_blank_price")
        or product.get("estimated_blank_cost")
    )
    platform_print = money(
        product.get("platform_print_cost")
        or product.get("estimated_print_cost")
        or product.get("print_cost")
    )
    creator_print = money(
        product.get("creator_print_price")
        or product.get("estimated_print_cost")
        or product.get("print_cost")
    )

    rate = number(product.get("commission_rate"), 0.15)
    selling = money(
        product.get("customer_selling_price")
        or product.get("selling_price")
    )

    creator_subtotal = money(creator_blank + creator_print)
    platform_fee = money(
        production_fee_amount(creator_subtotal, rate)
    )
    creator_total = money(
        total_cost_to_produce(creator_subtotal, rate)
    )
    platform_total = money(
        platform_blank
        + platform_print
        + packaging
        + additional_platform
    )
    profit = money(
        creator_amount_for_sale(
            selling,
            creator_subtotal,
            rate,
        )
    )

    return {
        "version": PRODUCTION_RULES_VERSION,
        "blank_product_cost": platform_blank,
        "creator_blank_price": creator_blank,
        "artwork_production_cost": platform_print,
        "creator_artwork_price": creator_print,
        "packaging_cost": packaging,
        "creator_packaging_price": 0.0,
        "additional_manufacturing_charges": charges,
        "additional_manufacturing_cost": money(additional_platform),
        "creator_additional_manufacturing_price": 0.0,
        "production_cost": platform_total,
        "production_subtotal": creator_subtotal,
        "creator_product_cost": creator_total,
        "platform_fee_rate": rate,
        "platform_fee_amount": platform_fee,
        "platform_fee_basis": "blank_plus_printing",
        "minimum_selling_price": creator_total,
        "selling_price": selling,
        "creator_profit": profit,
        "pricing_integrity": (
            "valid"
            if profit >= number(
                settings.get("minimum_creator_profit_required"),
                0,
            )
            else "below_minimum"
        ),
    }


async def apply_production_rules(db, product_data: dict, *, template: Optional[dict] = None, global_print_options: Optional[List[dict]] = None, publishing: bool = False) -> dict:
    data = dict(product_data or {})
    if not data.get("template_id"):
        return data
    template = template or await db.product_templates.find_one({"id": data.get("template_id")}, {"_id": 0}) or {}
    options = option_map(template, global_print_options if global_print_options is not None else await db.print_options.find({}, {"_id": 0}).to_list(500))
    areas = area_map(template)
    rules = await load_method_rules(db)
    settings = await load_settings(db)
    slots = iter_slots(data)
    categories = infer_categories(data, template)
    materials = infer_materials(data, template)
    errors: List[dict] = []
    warnings: List[dict] = []
    method_keys: List[str] = []
    total_layers = total_presses = 0
    total_seconds = 0.0
    slot_lookup: Dict[str, dict] = {}

    if not slots and template.get("requires_artwork", True):
        errors.append(issue("error", "artwork_required", "Artwork is required before this product can be manufactured."))

    for slot in slots:
        if not has_artwork(slot):
            continue
        area = areas.get(str(slot.get("print_area_id") or ""))
        if not area:
            errors.append(issue("error", "invalid_print_area", "Artwork uses a print area that does not exist on this blank product.", slot)); continue
        method = method_from_slot(slot, options)
        if not method:
            errors.append(issue("error", "missing_print_method", "Artwork must have a manufacturing print method.", slot)); continue
        slot["method_key"] = slot["manufacturing_method_id"] = method
        if method not in method_keys:
            method_keys.append(method)
        rule = rules.get(method)
        if not rule:
            errors.append(issue("error", "inactive_or_unknown_print_method", f"{method} is not an active manufacturing method.", slot, method)); continue

        allowed = allowed_area_methods(area, options)
        if allowed and method not in allowed:
            errors.append(issue("error", "print_method_not_supported_by_area", f"{rule.get('display_name') or method} is not supported on {area.get('name') or 'this print area'}.", slot, method, {"allowed_methods": allowed}))

        supported_cats = [category_key(v) for v in rule.get("supported_product_categories") or []]
        if not matches_supported(categories, supported_cats, {"apparel": {"shirt", "t_shirt", "hoodie", "cap", "bag"}, "hard_surface": {"mug", "bottle", "tumbler", "sticker"}}):
            warnings.append(issue("warning", "category_not_confirmed", f"{rule.get('display_name')} is not explicitly confirmed for this product category.", slot, method, {"categories": categories}))

        supported_mats = [material_key(v) for v in rule.get("supported_materials") or []]
        if materials:
            if not matches_supported(materials, supported_mats, {"fabric": {"cotton", "cotton_blend", "polyester", "polyester_blend"}, "hard_surface": {"ceramic", "glass", "metal", "plastic", "acrylic", "polymer_coated"}}):
                errors.append(issue("error", "material_incompatible", f"{rule.get('display_name')} is not compatible with this blank material/substrate.", slot, method, {"materials": materials, "supported_materials": rule.get("supported_materials") or []}))
        elif not settings.get("allow_unknown_material_with_warning", True):
            errors.append(issue("error", "material_required", "Blank product material/substrate must be configured before publishing.", slot, method))
        else:
            warnings.append(issue("warning", "material_not_configured", "Blank material/substrate was not explicitly configured. Confirm it in the template before scale-up.", slot, method))

        atype = artwork_type(slot)
        if atype != "unknown" and atype not in [key(v) for v in rule.get("supported_artwork_types") or []]:
            errors.append(issue("error", "artwork_type_incompatible", f"{atype.upper()} artwork is not supported for {rule.get('display_name')}.", slot, method))

        x, y, w, h = placement(slot)
        if rule.get("validation_rules", {}).get("enforce_print_area_boundary", True) and (x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 100 or y + h > 100):
            errors.append(issue("error", "artwork_overflows_print_area", "Artwork exceeds the printable boundary.", slot, method, {"x": x, "y": y, "width": w, "height": h}))

        area_w, area_h, art_w, art_h = dimensions(slot, area)
        if number(rule.get("maximum_artwork_width_mm")) and art_w > number(rule.get("maximum_artwork_width_mm")):
            errors.append(issue("error", "artwork_too_wide", f"Artwork width {art_w:.1f} mm exceeds the {rule.get('display_name')} maximum.", slot, method))
        if number(rule.get("maximum_artwork_height_mm")) and art_h > number(rule.get("maximum_artwork_height_mm")):
            errors.append(issue("error", "artwork_too_tall", f"Artwork height {art_h:.1f} mm exceeds the {rule.get('display_name')} maximum.", slot, method))
        if art_w and number(rule.get("minimum_artwork_width_mm")) and art_w < number(rule.get("minimum_artwork_width_mm")):
            errors.append(issue("error", "artwork_too_small", "Artwork is smaller than the minimum manufacturable size.", slot, method))
        if number(slot.get("dpi"), 300) < number(rule.get("minimum_resolution_dpi"), 300):
            errors.append(issue("error", "resolution_too_low", f"Artwork must be at least {int(number(rule.get('minimum_resolution_dpi'), 300))} DPI.", slot, method))

        colours = slot_colours(slot)
        if not colours and method in {"htv", "adhesive_vinyl"}:
            colours = ["black"]
        colour_mode = (rule.get("supported_colours") or {}).get("mode") or "unlimited_rgb"
        library = colour_library_tokens(rule)
        if colour_mode == "restricted_library" and rule.get("validation_rules", {}).get("enforce_colour_library", True):
            unsupported = [c for c in colours if c not in library]
            if unsupported:
                errors.append(issue("error", "unsupported_colour", f"{rule.get('display_name')} can only use stocked colours.", slot, method, {"unsupported_colours": unsupported, "approved_colours": [c.get("name") for c in library.values()]}))

        behaviour = rule.get("layer_behaviour") or {}
        layer_count = int(number(slot.get("layer_count") or slot.get("operation_count"), 0) or (max(1, len(colours)) if behaviour.get("colour_creates_layer") else behaviour.get("default_layers", 1)))
        max_layers = int(number(behaviour.get("max_layers"), 0))
        if max_layers and layer_count > max_layers:
            errors.append(issue("error", "too_many_layers", f"{rule.get('display_name')} allows a maximum of {max_layers} layers.", slot, method))
        press = rule.get("press_behaviour") or {}
        press_count = layer_count if press.get("model") in {"one_press_per_layer", "one_application_per_layer"} else int(number(press.get("presses_per_area"), 1))
        seconds = number(press.get("seconds_per_press"), 0)
        total_layers += layer_count; total_presses += max(1, press_count); total_seconds += max(1, press_count) * seconds
        slot.update({
            "production_rule_id": rule.get("id"), "production_rule_version": rule.get("version") or PRODUCTION_RULES_VERSION,
            "manufacturing_method_id": method, "method_key": method, "colour_mode": colour_mode,
            "approved_colour_library": (rule.get("supported_colours") or {}).get("library_id"),
            "approved_colours": (rule.get("supported_colours") or {}).get("colours") or [], "detected_colours": colours,
            "layer_count": layer_count, "press_count": max(1, press_count), "press_duration_seconds": round(max(1, press_count) * seconds, 2),
            "press_operation_type": press.get("operation_type"), "mirror_artwork_required": bool(rule.get("mirror_artwork_required")),
            "transparent_background_required": bool(rule.get("transparent_background_required")), "gang_sheet_capable": bool(rule.get("gang_sheet_capable")),
            "print_area_width_mm": round(area_w, 2) if area_w else slot.get("print_area_width_mm"),
            "print_area_height_mm": round(area_h, 2) if area_h else slot.get("print_area_height_mm"),
            "artwork_width_mm": round(art_w, 2) if art_w else slot.get("artwork_width_mm"),
            "artwork_height_mm": round(art_h, 2) if art_h else slot.get("artwork_height_mm"),
        })
        if slot.get("id"):
            slot_lookup[slot["id"]] = slot

    sync_slots(data, slot_lookup)
    manufacturing = cost_integrity(data, settings)
    if manufacturing["pricing_integrity"] != "valid":
        errors.append(issue("error", "selling_price_below_minimum", f"Selling price is below the manufacturable minimum of R{manufacturing['minimum_selling_price']:.2f}."))

    status = "invalid" if errors or (settings.get("fail_publish_on_warnings") and warnings) else "valid"
    validation = {"version": PRODUCTION_RULES_VERSION, "status": status, "validated_at_source": "server", "errors": errors, "warnings": warnings, "method_keys": method_keys, "materials": materials, "categories": categories, "total_layers": total_layers, "total_presses": total_presses, "total_press_duration_seconds": round(total_seconds, 2), "artwork_slot_count": len([s for s in slots if has_artwork(s)]), "print_area_count": len({s.get("print_area_id") for s in slots if s.get("print_area_id")})}

    data.update({
        "production_rule_version": PRODUCTION_RULES_VERSION, "manufacturing_validation_status": status, "production_validation": validation,
        "manufacturing_cost_breakdown": manufacturing, "platform_packaging_cost": manufacturing["packaging_cost"],
        "creator_packaging_price": manufacturing["creator_packaging_price"], "platform_additional_manufacturing_cost": manufacturing["additional_manufacturing_cost"],
        "creator_additional_manufacturing_price": manufacturing["creator_additional_manufacturing_price"], "platform_total_production_cost": manufacturing["production_cost"],
        "minimum_selling_price": manufacturing["minimum_selling_price"], "creator_product_cost": manufacturing["creator_product_cost"],
        "estimated_total_cost": manufacturing["creator_product_cost"], "estimated_creator_profit": manufacturing["creator_profit"],
    })
    breakdown = dict(data.get("costing_breakdown") or {})
    breakdown.update({"manufacturing_rules_version": PRODUCTION_RULES_VERSION, "manufacturing_validation_status": status, "manufacturing_cost_breakdown": manufacturing, "production_validation": validation, "minimum_selling_price": manufacturing["minimum_selling_price"], "production_unit_cost": manufacturing["creator_product_cost"], "creator_product_cost": manufacturing["creator_product_cost"], "creator_profit_unit": manufacturing["creator_profit"]})
    data["costing_breakdown"] = breakdown

    if publishing and status != "valid":
        raise HTTPException(status_code=400, detail={"message": "Product cannot be published because it is not manufacturable under the active production rules.", "errors": errors, "warnings": warnings, "minimum_selling_price": manufacturing["minimum_selling_price"], "status": status})
    return data
