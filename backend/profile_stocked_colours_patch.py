"""Profile-level stocked-colour restrictions for HTV and adhesive vinyl.

The manufacturing method owns the master stocked-colour pool. Individual costing
profiles may either inherit that full pool or select a restricted subset. Builder
profile projections and server-side production validation use the same subset.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

from seed_production_operations import normalize_method_key


STOCKED_METHODS = {"htv", "adhesive_vinyl"}
RESTRICTED_MODES = {"restricted", "selected", "profile_restricted", "subset"}
INHERIT_MODES = {"inherit", "inherit_method", "all", "method"}


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


def _profile_colour_ids(profile: Dict[str, Any]) -> List[str]:
    return _text_list(
        profile.get("supported_colour_ids")
        or profile.get("available_colour_ids")
        or profile.get("stocked_colour_ids")
        or []
    )


def _profile_colour_mode(profile: Dict[str, Any]) -> str:
    explicit = str(
        profile.get("colour_selection_mode")
        or profile.get("color_selection_mode")
        or profile.get("profile_colour_mode")
        or ""
    ).strip().lower()
    if explicit in RESTRICTED_MODES:
        return "restricted"
    if explicit in INHERIT_MODES:
        return "inherit_method"
    return "restricted" if _profile_colour_ids(profile) else "inherit_method"


def _normalise_colour(colour: Any) -> Optional[Dict[str, Any]]:
    if isinstance(colour, str):
        value = colour.strip()
        if not value:
            return None
        return {
            "id": value.lower().replace(" ", "_"),
            "name": value,
            "label": value,
            "value": value,
            "hex": value if value.startswith("#") else "",
            "aliases": [],
            "active": True,
        }
    if not isinstance(colour, dict) or colour.get("active") is False:
        return None
    value = str(
        colour.get("hex")
        or colour.get("value")
        or colour.get("code")
        or colour.get("id")
        or colour.get("name")
        or ""
    ).strip()
    label = str(colour.get("label") or colour.get("name") or colour.get("id") or value).strip()
    if not (value or label):
        return None
    return {
        **colour,
        "id": str(colour.get("id") or label.lower().replace(" ", "_")),
        "name": label,
        "label": label,
        "value": value or label,
        "hex": str(colour.get("hex") or (value if value.startswith("#") else "")),
        "aliases": list(colour.get("aliases") or []),
        "active": True,
    }


def _colour_tokens(colour: Dict[str, Any]) -> set[str]:
    values = [
        colour.get("id"),
        colour.get("name"),
        colour.get("label"),
        colour.get("value"),
        colour.get("hex"),
        *(colour.get("aliases") or []),
    ]
    return {str(value).strip().lower() for value in values if str(value or "").strip()}


def _method_colours(method: Dict[str, Any]) -> List[Dict[str, Any]]:
    supported = method.get("supported_colours") or {}
    raw = supported.get("colours") if isinstance(supported, dict) else []
    return [row for row in (_normalise_colour(value) for value in (raw or [])) if row]


def profile_stocked_colours(method: Dict[str, Any], profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    colours = _method_colours(method)
    if normalize_method_key(method.get("method_key") or method.get("internal_id")) not in STOCKED_METHODS:
        return colours
    if _profile_colour_mode(profile) != "restricted":
        return colours
    allowed = {value.lower() for value in _profile_colour_ids(profile)}
    if not allowed:
        return []
    return [colour for colour in colours if _colour_tokens(colour).intersection(allowed)]


def _selected_colour_token(slot: Dict[str, Any]) -> str:
    selected = (
        slot.get("selected_stocked_colour")
        or slot.get("stocked_colour")
        or slot.get("vinyl_colour")
        or slot.get("vinyl_color")
        or ""
    )
    if isinstance(selected, dict):
        selected = selected.get("id") or selected.get("value") or selected.get("hex") or selected.get("name") or ""
    return str(selected or "").strip().lower()


def _slot_colour_is_allowed(selected: str, colours: List[Dict[str, Any]]) -> bool:
    return bool(selected) and any(selected in _colour_tokens(colour) for colour in colours)


def _validation_error(slot: Dict[str, Any], method: str, profile: Dict[str, Any], colours: List[Dict[str, Any]], code: str, message: str) -> Dict[str, Any]:
    return {
        "level": "error",
        "code": code,
        "message": message,
        "slot_id": slot.get("id"),
        "print_area_id": slot.get("print_area_id"),
        "method_key": method,
        "meta": {
            "manufacturing_profile_id": profile.get("id"),
            "profile_name": profile.get("display_name") or profile.get("profile_name"),
            "approved_colours": [colour.get("name") for colour in colours],
        },
    }


def install_profile_stocked_colours_patch(
    routes_production_rules_module=None,
    *,
    install_validation: bool = True,
) -> None:
    """Install profile persistence/projection and optional runtime validation."""
    import unified_manufacturing_costing as unified
    import production_method_profiles as profiles_module

    if not getattr(unified, "_profile_stocked_colours_patch_installed", False):
        original_normalize = unified.normalize_costing_profile

        def patched_normalize(profile: Dict[str, Any], method_key: str, *, is_default: bool = False) -> Dict[str, Any]:
            row = original_normalize(profile, method_key, is_default=is_default)
            mode = _profile_colour_mode(profile)
            colour_ids = _profile_colour_ids(profile)
            row["colour_selection_mode"] = mode
            row["color_selection_mode"] = mode
            row["supported_colour_ids"] = colour_ids
            row["available_colour_ids"] = list(colour_ids)
            return row

        unified.normalize_costing_profile = patched_normalize
        unified._profile_stocked_colours_patch_installed = True

    if not getattr(profiles_module, "_profile_stocked_colours_patch_installed", False):
        original_projection = profiles_module.production_method_profile_to_print_option

        def patched_projection(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
            row = original_projection(method, profile)
            colours = profile_stocked_colours(method, profile)
            mode = _profile_colour_mode(profile)
            row.update({
                "colour_selection_mode": mode,
                "color_selection_mode": mode,
                "supported_colour_ids": _profile_colour_ids(profile),
                "available_colour_ids": _profile_colour_ids(profile),
                "approved_stocked_colours": colours,
                "stocked_colours": colours,
            })
            return row

        profiles_module.production_method_profile_to_print_option = patched_projection
        profiles_module._profile_stocked_colours_patch_installed = True

    if not install_validation:
        return

    import production_rules_engine as rules_engine
    import builder_production_rules_patch as builder_patch

    if not getattr(rules_engine, "_profile_stocked_colours_patch_installed", False):
        original_apply = rules_engine.apply_production_rules

        async def patched_apply(db, product_data: dict, *, template=None, global_print_options=None, publishing: bool = False):
            data = await original_apply(
                db,
                product_data,
                template=template,
                global_print_options=global_print_options,
                publishing=False,
            )
            validation = dict(data.get("production_validation") or {})
            errors = list(validation.get("errors") or [])
            method_docs = await db.production_methods.find({}, {"_id": 0}).to_list(200)
            methods = {
                normalize_method_key(doc.get("method_key") or doc.get("internal_id")): doc
                for doc in method_docs
            }

            for slot in rules_engine.iter_slots(data):
                method = normalize_method_key(
                    slot.get("method_key")
                    or slot.get("manufacturing_method_id")
                    or slot.get("print_method")
                )
                if method not in STOCKED_METHODS:
                    continue
                method_doc = methods.get(method)
                if not method_doc:
                    continue
                profile = unified.resolve_costing_profile(method_doc, slot=slot)
                if not profile:
                    continue
                colours = profile_stocked_colours(method_doc, profile)
                slot["colour_selection_mode"] = _profile_colour_mode(profile)
                slot["approved_stocked_colours"] = deepcopy(colours)
                slot["approved_colours"] = deepcopy(colours)
                selected = _selected_colour_token(slot)

                if _profile_colour_mode(profile) == "restricted" and not colours:
                    errors.append(_validation_error(
                        slot,
                        method,
                        profile,
                        colours,
                        "profile_has_no_stocked_colours",
                        f"{profile.get('display_name') or profile.get('profile_name')} has no available stocked colours configured.",
                    ))
                elif selected and not _slot_colour_is_allowed(selected, colours):
                    errors.append(_validation_error(
                        slot,
                        method,
                        profile,
                        colours,
                        "unsupported_profile_colour",
                        f"The selected colour is not available for {profile.get('display_name') or profile.get('profile_name')}.",
                    ))

            deduped = []
            seen = set()
            for error in errors:
                identity = (
                    error.get("code"),
                    error.get("slot_id"),
                    str(error.get("meta", {}).get("manufacturing_profile_id") or ""),
                )
                if identity in seen:
                    continue
                seen.add(identity)
                deduped.append(error)

            validation["errors"] = deduped
            validation["status"] = "invalid" if deduped or validation.get("status") == "invalid" else "valid"
            data["production_validation"] = validation
            data["manufacturing_validation_status"] = validation["status"]
            breakdown = dict(data.get("costing_breakdown") or {})
            breakdown["production_validation"] = validation
            breakdown["manufacturing_validation_status"] = validation["status"]
            data["costing_breakdown"] = breakdown

            if publishing and validation["status"] != "valid":
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail={
                    "message": "Product cannot be published because it is not manufacturable under the active production rules.",
                    "errors": validation.get("errors") or [],
                    "warnings": validation.get("warnings") or [],
                    "minimum_selling_price": data.get("minimum_selling_price"),
                    "status": validation["status"],
                })
            return data

        rules_engine.apply_production_rules = patched_apply
        builder_patch.apply_production_rules = patched_apply
        rules_engine._profile_stocked_colours_patch_installed = True

    if routes_production_rules_module is not None:
        routes_production_rules_module.apply_production_rules = rules_engine.apply_production_rules
