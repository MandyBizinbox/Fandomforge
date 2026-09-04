"""Profile-level stocked-colour semantics for manufacturing profiles."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

from htv_profile_colour_assignment import (
    HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION,
    PROFILE_RANGES,
    profile_range_key,
)
from seed_production_operations import normalize_method_key

STOCKED_METHODS = {"htv", "adhesive_vinyl"}
RESTRICTED_MODES = {"restricted", "selected", "profile_restricted", "subset"}
INHERIT_MODES = {"inherit", "inherit_method", "all", "method"}
COLOUR_MODE_FIELDS = ("colour_selection_mode", "color_selection_mode", "profile_colour_mode")


def text_list(value: Any) -> List[str]:
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


def profile_supported_colour_ids(profile: Dict[str, Any]) -> List[str]:
    return text_list(profile.get("supported_colour_ids") or profile.get("stocked_colour_ids") or profile.get("available_colour_ids") or [])


def profile_available_colour_ids(profile: Dict[str, Any]) -> List[str]:
    if "available_colour_ids" in profile:
        return text_list(profile.get("available_colour_ids") or [])
    return profile_supported_colour_ids(profile)


def profile_colour_mode(profile: Dict[str, Any]) -> str:
    explicit = next((str(profile.get(field) or "").strip().lower() for field in COLOUR_MODE_FIELDS if profile.get(field) not in (None, "")), "")
    if explicit in RESTRICTED_MODES:
        return "restricted"
    if explicit in INHERIT_MODES:
        return "inherit_method"
    return "restricted" if (profile_supported_colour_ids(profile) or profile_available_colour_ids(profile)) else "inherit_method"


def explicit_colour_configuration(profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    explicit_mode = next((str(profile.get(field) or "").strip().lower() for field in COLOUR_MODE_FIELDS if profile.get(field) not in (None, "")), "")
    supported_present = "supported_colour_ids" in profile or "stocked_colour_ids" in profile
    available_present = "available_colour_ids" in profile
    supported = text_list(profile.get("supported_colour_ids") or profile.get("stocked_colour_ids") or [])
    available = text_list(profile.get("available_colour_ids")) if available_present else list(supported)
    if explicit_mode in RESTRICTED_MODES or (not explicit_mode and supported):
        return {"colour_selection_mode":"restricted","color_selection_mode":"restricted","supported_colour_ids":supported,"available_colour_ids":available}
    if explicit_mode in INHERIT_MODES:
        return {"colour_selection_mode":"inherit_method","color_selection_mode":"inherit_method","supported_colour_ids":[],"available_colour_ids":[]}
    if supported_present or available_present:
        mode = "restricted" if supported or available else "inherit_method"
        return {"colour_selection_mode":mode,"color_selection_mode":mode,"supported_colour_ids":supported,"available_colour_ids":available}
    return None


def normalize_profile_colour_fields(profile: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(profile or {})
    config = explicit_colour_configuration(row)
    if config is None:
        mode = profile_colour_mode(row)
        config = {"colour_selection_mode":mode,"color_selection_mode":mode,"supported_colour_ids":profile_supported_colour_ids(row),"available_colour_ids":profile_available_colour_ids(row)}
    row.update(config)
    return row


def preserve_profile_colour_configuration(existing: Dict[str, Any], incoming: Dict[str, Any], merged: Dict[str, Any]) -> Dict[str, Any]:
    configuration = explicit_colour_configuration(existing) or explicit_colour_configuration(incoming)
    if configuration:
        merged.update(deepcopy(configuration))
    for field in ("stocked_colour_seed_version", "stocked_colour_assignment_version"):
        value = existing.get(field) if existing.get(field) not in (None, "") else incoming.get(field)
        if value not in (None, ""):
            merged[field] = value
    return merged


def normalise_colour(colour: Any) -> Optional[Dict[str, Any]]:
    if isinstance(colour, str):
        value = colour.strip()
        if not value:
            return None
        return {"id":value.lower().replace(" ","_"),"name":value,"label":value,"value":value,"hex":value if value.startswith("#") else "","aliases":[],"active":True}
    if not isinstance(colour, dict) or colour.get("active") is False:
        return None
    value = str(colour.get("hex") or colour.get("value") or colour.get("code") or colour.get("id") or colour.get("name") or "").strip()
    label = str(colour.get("label") or colour.get("name") or colour.get("id") or value).strip()
    if not (value or label):
        return None
    return {**colour,"id":str(colour.get("id") or label.lower().replace(" ","_")),"name":label,"label":label,"value":value or label,"hex":str(colour.get("hex") or (value if value.startswith("#") else "")),"aliases":list(colour.get("aliases") or []),"active":True}


def colour_tokens(colour: Dict[str, Any]) -> set[str]:
    values = [colour.get("id"), colour.get("name"), colour.get("label"), colour.get("value"), colour.get("hex"), *(colour.get("aliases") or [])]
    return {str(value).strip().lower() for value in values if str(value or "").strip()}


def method_colours(method: Dict[str, Any]) -> List[Dict[str, Any]]:
    supported = method.get("supported_colours") or {}
    raw = supported.get("colours") if isinstance(supported, dict) else []
    return [row for row in (normalise_colour(value) for value in (raw or [])) if row]


def profile_stocked_colours(method: Dict[str, Any], profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    colours = method_colours(method)
    if normalize_method_key(method.get("method_key") or method.get("internal_id")) not in STOCKED_METHODS:
        return colours
    if profile_colour_mode(profile) != "restricted":
        return colours
    allowed = {value.lower() for value in profile_available_colour_ids(profile)}
    if not allowed:
        return []
    return [colour for colour in colours if colour_tokens(colour).intersection(allowed)]


def authoritative_profile_colour_overlay(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    row = deepcopy(profile)
    if normalize_method_key(method.get("method_key") or method.get("internal_id")) != "htv":
        return row
    key = profile_range_key(row)
    if key not in PROFILE_RANGES:
        return row
    ranges = PROFILE_RANGES[key]
    row.update({"colour_selection_mode":"restricted","color_selection_mode":"restricted","supported_colour_ids":list(ranges["supported"]),"available_colour_ids":list(ranges["available"]),"stocked_colour_assignment_version":HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION})
    return row


def selected_colour_token(slot: Dict[str, Any]) -> str:
    selected = slot.get("selected_stocked_colour") or slot.get("stocked_colour") or slot.get("vinyl_colour") or slot.get("vinyl_color") or ""
    if isinstance(selected, dict):
        selected = selected.get("id") or selected.get("value") or selected.get("hex") or selected.get("name") or ""
    return str(selected or "").strip().lower()


def slot_colour_is_allowed(selected: str, colours: List[Dict[str, Any]]) -> bool:
    return bool(selected) and any(selected in colour_tokens(colour) for colour in colours)
