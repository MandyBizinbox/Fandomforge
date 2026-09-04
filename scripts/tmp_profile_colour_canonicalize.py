from pathlib import Path
import ast

root = Path('.')

# Canonical profile-colour domain module.
colours = root/'backend/manufacturing_profile_colours.py'
colours.write_text('''"""Profile-level stocked-colour semantics for manufacturing profiles."""
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
        values = value.replace(",", "\\n").splitlines()
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
''')
ast.parse(colours.read_text())

# unified_manufacturing_costing owns colour persistence/merge/authoritative overlays.
p = root/'backend/unified_manufacturing_costing.py'
s = p.read_text()
anchor = 'from seed_production_operations import normalize_method_key\n'
assert anchor in s
s = s.replace(anchor, anchor + 'from manufacturing_profile_colours import (\n    authoritative_profile_colour_overlay,\n    normalize_profile_colour_fields,\n    preserve_profile_colour_configuration,\n)\n', 1)
old = '    source = _apply_approved_rate(dict(profile or {}), method)\n'
assert old in s
s = s.replace(old, '    source = normalize_profile_colour_fields(_apply_approved_rate(dict(profile or {}), method))\n', 1)
old = '    merged["is_default"] = bool(existing.get("is_default") or incoming.get("is_default"))\n'
assert old in s
s = s.replace(old, '    merged = preserve_profile_colour_configuration(existing, incoming, merged)\n' + old, 1)
old = '    for profile in profiles:\n        profile["is_default"] = profile["id"] == default_id\n    return profiles\n'
assert old in s
s = s.replace(old, '    for profile in profiles:\n        profile["is_default"] = profile["id"] == default_id\n    return [authoritative_profile_colour_overlay(method, profile) for profile in profiles]\n', 1)
ast.parse(s); p.write_text(s)

# production_method_profiles owns Builder/API colour projection.
p = root/'backend/production_method_profiles.py'
s = p.read_text()
anchor = 'from seed_production_operations import normalize_method_key\n'
assert anchor in s
s = s.replace(anchor, anchor + 'from manufacturing_profile_colours import (\n    profile_available_colour_ids,\n    profile_colour_mode,\n    profile_stocked_colours,\n    profile_supported_colour_ids,\n)\n', 1)
old = '''def production_method_profile_to_print_option(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:\n    row = profile_to_print_option(method, profile)\n    colours = _method_stocked_colours(method)\n    colour_mode = _method_colour_mode(method)\n    row.update({\n        "colour_mode": colour_mode,\n        "color_mode": colour_mode,\n        "approved_stocked_colours": colours,\n        "stocked_colours": colours,\n    })\n    return row\n'''
new = '''def production_method_profile_to_print_option(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:\n    row = profile_to_print_option(method, profile)\n    colours = profile_stocked_colours(method, profile)\n    colour_mode = _method_colour_mode(method)\n    selection_mode = profile_colour_mode(profile)\n    row.update({\n        "colour_mode": colour_mode,\n        "color_mode": colour_mode,\n        "colour_selection_mode": selection_mode,\n        "color_selection_mode": selection_mode,\n        "supported_colour_ids": profile_supported_colour_ids(profile),\n        "available_colour_ids": profile_available_colour_ids(profile),\n        "approved_stocked_colours": colours,\n        "stocked_colours": colours,\n    })\n    return row\n'''
assert old in s
s = s.replace(old, new, 1)
ast.parse(s); p.write_text(s)

# production_operation_pricing resolves canonical profiles directly.
p = root/'backend/production_operation_pricing.py'
s = p.read_text()
anchor = 'from seed_production_operations import ACTIVE_V1_METHOD_KEYS, normalize_method_key\n'
assert anchor in s
s = s.replace(anchor, anchor + 'from unified_manufacturing_costing import resolve_costing_profile\n', 1)
start = s.index('def _profile_matches_option(')
end = s.index('def _pricing_fields_from_method(', start)
s = s[:start] + '''def _method_profile_for_slot(method_rule: Optional[Dict[str, Any]], option: Dict[str, Any], slot: Dict[str, Any]) -> Optional[Dict[str, Any]]:\n    identifier = (\n        slot.get("manufacturing_profile_id")\n        or slot.get("production_profile_id")\n        or slot.get("print_option_id")\n        or option.get("manufacturing_profile_id")\n        or option.get("production_profile_id")\n        or option.get("id")\n    )\n    return resolve_costing_profile(method_rule, identifier, option=option, slot=slot)\n\n\n''' + s[end:]
ast.parse(s); p.write_text(s)

# outsourced rate classifier owns identity-aware matching without runtime replacement.
p = root/'backend/outsourced_production_rates.py'
s = p.read_text()
old = '''    fields = (\n        "method_key",\n        "manufacturing_method_id",\n        "print_method",\n        "method",\n        "method_name",\n        "rule_name",\n        "profile_name",\n        "profile_label",\n        "display_label",\n        "print_size",\n'''
new = '''    fields = (\n        "method_key",\n        "manufacturing_method_id",\n        "print_method",\n        "method",\n        "id",\n        "profile_id",\n        "manufacturing_profile_id",\n        "production_profile_id",\n        "method_name",\n        "display_name",\n        "rule_name",\n        "profile_name",\n        "profile_label",\n        "display_label",\n        "print_size",\n'''
assert old in s
s = s.replace(old, new, 1)
ast.parse(s); p.write_text(s)

# production_rules_engine owns profile-specific stocked-colour validation.
p = root/'backend/production_rules_engine.py'
s = p.read_text()
anchor = 'from seed_production_operations import normalize_method_key\n'
assert anchor in s
s = s.replace(anchor, anchor + 'from unified_manufacturing_costing import resolve_costing_profile\nfrom manufacturing_profile_colours import (\n    STOCKED_METHODS,\n    profile_available_colour_ids,\n    profile_colour_mode,\n    profile_stocked_colours,\n    profile_supported_colour_ids,\n    selected_colour_token,\n    slot_colour_is_allowed,\n)\n', 1)
old = '''        if colour_mode == "restricted_library" and rule.get("validation_rules", {}).get("enforce_colour_library", True):\n            unsupported = [c for c in colours if c not in library]\n            if unsupported:\n                errors.append(issue("error", "unsupported_colour", f"{rule.get('display_name')} can only use stocked colours.", slot, method, {"unsupported_colours": unsupported, "approved_colours": [c.get("name") for c in library.values()]}))\n\n        behaviour = rule.get("layer_behaviour") or {}\n'''
new = '''        if colour_mode == "restricted_library" and rule.get("validation_rules", {}).get("enforce_colour_library", True):\n            unsupported = [c for c in colours if c not in library]\n            if unsupported:\n                errors.append(issue("error", "unsupported_colour", f"{rule.get('display_name')} can only use stocked colours.", slot, method, {"unsupported_colours": unsupported, "approved_colours": [c.get("name") for c in library.values()]}))\n\n        if method in STOCKED_METHODS:\n            profile = resolve_costing_profile(rule, slot=slot)\n            if profile:\n                approved_profile_colours = profile_stocked_colours(rule, profile)\n                selection_mode = profile_colour_mode(profile)\n                slot.update({\n                    "colour_selection_mode": selection_mode,\n                    "color_selection_mode": selection_mode,\n                    "supported_colour_ids": profile_supported_colour_ids(profile),\n                    "available_colour_ids": profile_available_colour_ids(profile),\n                    "approved_stocked_colours": deepcopy(approved_profile_colours),\n                    "approved_colours": deepcopy(approved_profile_colours),\n                })\n                selected = selected_colour_token(slot)\n                profile_name = profile.get("display_name") or profile.get("profile_name") or "manufacturing profile"\n                if selection_mode == "restricted" and not approved_profile_colours:\n                    errors.append(issue("error", "profile_has_no_stocked_colours", f"{profile_name} has no available stocked colours configured.", slot, method, {"manufacturing_profile_id": profile.get("id"), "profile_name": profile_name, "approved_colours": []}))\n                elif selected and not slot_colour_is_allowed(selected, approved_profile_colours):\n                    errors.append(issue("error", "unsupported_profile_colour", f"The selected colour is not available for {profile_name}.", slot, method, {"manufacturing_profile_id": profile.get("id"), "profile_name": profile_name, "approved_colours": [colour.get("name") for colour in approved_profile_colours]}))\n\n        behaviour = rule.get("layer_behaviour") or {}\n'''
assert old in s
s = s.replace(old, new, 1)
ast.parse(s); p.write_text(s)

# server no longer installs profile/colour runtime patches or rebinding layers.
p = root/'backend/server.py'
s = p.read_text()
for old in [
    'from production_profile_resolution_patch import install_production_profile_resolution_patch\n',
    'from profile_stocked_colours_patch import install_profile_stocked_colours_patch\n',
    'from profile_colour_projection_repair import install_profile_colour_projection_repair\n',
    'install_production_profile_resolution_patch()\n',
    'install_profile_stocked_colours_patch()\n',
    'install_profile_colour_projection_repair()\n',
    'install_profile_stocked_colours_patch(routes_production_rules_module)\n',
    'install_profile_colour_projection_repair(routes_production_rules_module)\n',
]:
    assert old in s, old
    s = s.replace(old, '')
ast.parse(s); p.write_text(s)

# Rewrite profile-colour tests to assert canonical behaviour directly.
p = root/'backend/tests/test_profile_stocked_colours.py'
s = p.read_text()
s = s.replace('from types import SimpleNamespace\n\n', '')
s = s.replace('from profile_colour_projection_repair import install_profile_colour_projection_repair\nfrom profile_stocked_colours_patch import (\n    install_profile_stocked_colours_patch,\n    profile_stocked_colours,\n)\n', 'from manufacturing_profile_colours import profile_stocked_colours\n')
start = s.index('    @classmethod\n    def setUpClass(cls):')
end = s.index('    def setUp(self):', start)
s = s[:start] + s[end:]
s = s.replace('        projected = self.route_bindings.method_with_unified_profiles(method)\n', '        projected = unified_manufacturing_costing.method_with_unified_profiles(method)\n')
old = '''        self.assertIs(\n            self.route_bindings.method_with_unified_profiles,\n            unified_manufacturing_costing.method_with_unified_profiles,\n        )\n'''
s = s.replace(old, '')
p.write_text(s); ast.parse(s)

# Replace installer-focused resolution tests with canonical service tests.
p = root/'backend/tests/test_production_profile_resolution_patch.py'
s = p.read_text()
s = s.replace('from production_profile_resolution_patch import (\n    install_production_profile_resolution_patch,\n    resolve_method_profile_for_slot,\n)\n', 'from unified_manufacturing_costing import resolve_costing_profile\n')
s = s.replace('class ProductionProfileResolutionPatchTests(unittest.TestCase):', 'class ProductionProfileResolutionTests(unittest.TestCase):')
s = s.replace('resolve_method_profile_for_slot(\n            method_rule(),\n            {"id": "print_method_htv_classic"},\n            {"print_option_id": "print_method_htv_classic"},\n        )', 'resolve_costing_profile(method_rule(), "print_method_htv_classic", option={"id":"print_method_htv_classic"}, slot={"print_option_id":"print_method_htv_classic"})')
s = s.replace('resolve_method_profile_for_slot(\n            method_rule(),\n            {"id": "print_method_htv_3d_puff"},\n            {\n                "print_option_id": "print_method_htv_3d_puff",\n                "manufacturing_profile_id": "profile:htv:classic_htv",\n            },\n        )', 'resolve_costing_profile(method_rule(), None, option={"id":"print_method_htv_3d_puff"}, slot={"print_option_id":"print_method_htv_3d_puff","manufacturing_profile_id":"profile:htv:classic_htv"})')
s = s.replace('resolve_method_profile_for_slot(\n            method_rule(),\n            {"id": "missing-option"},\n            {"print_option_id": "missing-option"},\n        )', 'resolve_costing_profile(method_rule(), "missing-option", option={"id":"missing-option"}, slot={"print_option_id":"missing-option"})')
s = s.replace('    def test_pricing_fields_use_canonical_profile_after_install(self):\n        install_production_profile_resolution_patch()\n', '    def test_pricing_fields_use_canonical_profile_directly(self):\n')
start = s.index('    def test_install_is_idempotent(self):')
end = s.index('\n\nif __name__ == "__main__":', start)
s = s[:start] + s[end:]
p.write_text(s); ast.parse(s)

print('profile/colour canonicalization applied')
