from pathlib import Path
import ast

root = Path('.')
patch_path = root / 'backend/builder_artwork_costing_patch.py'
service_path = root / 'backend/product_artwork_costing.py'
routes_path = root / 'backend/routes_main.py'
server_path = root / 'backend/server.py'

patch = patch_path.read_text()
assert 'def install_builder_artwork_costing_patch(routes_main_module):' in patch
service_body = patch.split('def install_builder_artwork_costing_patch(routes_main_module):', 1)[0]
service_body = service_body.replace('"""Backend patch for Builder V2 artwork payloads and outsourced area costing."""', '"""Canonical artwork area costing and combined-layer pricing."""', 1)
# generated_text_artwork now owns text-source generation/persistence; remove duplicate SVG generation code imports/helpers from service.
service_body = service_body.replace('from urllib.parse import quote\n', '')
start = service_body.index('def _escape_svg(value: str) -> str:')
end = service_body.index('def _pricing_row(option: dict | None, slot: dict | None) -> dict:')
service_body = service_body[:start] + service_body[end:]
# slot file checks can use canonical text semantics without generating a second SVG implementation.
service_body = service_body.replace('from outsourced_production_rates import calculate_outsourced_area_cost, number\n', 'from outsourced_production_rates import calculate_outsourced_area_cost, number\nfrom generated_text_artwork import is_text_layer\n')
service_body = service_body.replace('return bool(slot.get("original_url") or slot.get("text_layer") or slot.get("text_content"))', 'return bool(slot.get("original_url") or is_text_layer(slot))')
service_body = service_body.replace('            _ensure_text_slot_file(slot)\n', '')
service_body += '''\n\ndef calculate_artwork_area_cost(base_calculate, slot: dict, area: dict, option: dict) -> dict:\n    """Apply outsourced area-rate costing on top of the canonical base calculation."""\n    return _patched_calculation(base_calculate, slot, area, option)\n\n\ndef apply_combined_artwork_costing(routes_main_module, template: dict, global_print_options: list, groups: list) -> None:\n    """Apply same-method combined-layer pricing after canonical slot enrichment."""\n    _adjust_combined_costing(routes_main_module, template, global_print_options, groups)\n'''
ast.parse(service_body)
service_path.write_text(service_body)

routes = routes_path.read_text()
anchor = '''from generated_text_artwork import (\n    materialize_text_slot,\n    materialize_product_artworks,\n    copy_text_metadata_to_snapshot,\n)\n'''
assert anchor in routes
addition = '''from product_artwork_costing import (\n    calculate_artwork_area_cost,\n    apply_combined_artwork_costing,\n)\n'''
assert addition not in routes
routes = routes.replace(anchor, anchor + addition, 1)

tree = ast.parse(routes)
funcs = {n.name:n for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
for name in ['_calculate_area_print_cost', '_enrich_and_validate_product_artwork_slots']:
    assert name in funcs, name
lines = routes.splitlines(keepends=True)
for name, new_name in [('_calculate_area_print_cost','_calculate_area_print_cost_core'),('_enrich_and_validate_product_artwork_slots','_enrich_and_validate_product_artwork_slots_core')]:
    node=funcs[name]; idx=node.lineno-1
    assert f'def {name}(' in lines[idx]
    lines[idx]=lines[idx].replace(f'def {name}(',f'def {new_name}(',1)
routes=''.join(lines)

tree=ast.parse(routes)
funcs={n.name:n for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
node=funcs['_calculate_area_print_cost_core']
lines=routes.splitlines(keepends=True)
lines[node.end_lineno:node.end_lineno]=['''\n\ndef _calculate_area_print_cost(slot: dict, area: dict, option: dict) -> dict:\n    return calculate_artwork_area_cost(_calculate_area_print_cost_core, slot, area, option)\n''']
routes=''.join(lines)

tree=ast.parse(routes)
funcs={n.name:n for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
node=funcs['_enrich_and_validate_product_artwork_slots_core']
lines=routes.splitlines(keepends=True)
wrapper='''\n\ndef _enrich_and_validate_product_artwork_slots(template: dict, global_print_options: list, groups: list, flat_artworks: list) -> None:\n    _enrich_and_validate_product_artwork_slots_core(template, global_print_options, groups, flat_artworks)\n    import sys\n    routes_module = sys.modules[__name__]\n    apply_combined_artwork_costing(routes_module, template, global_print_options, groups)\n    by_id = {\n        slot.get("id"): slot\n        for group in groups or []\n        for slot in group.get("artworks") or []\n        if slot.get("id")\n    }\n    for slot in flat_artworks or []:\n        if slot.get("id") in by_id:\n            slot.update(by_id[slot.get("id")])\n'''
lines[node.end_lineno:node.end_lineno]=[wrapper]
routes=''.join(lines)
ast.parse(routes)
routes_path.write_text(routes)

server=server_path.read_text()
for old in [
    'from builder_artwork_costing_patch import install_builder_artwork_costing_patch\n',
    'install_builder_artwork_costing_patch(routes_main_module)\n',
]:
    assert old in server, old
    server=server.replace(old,'')
ast.parse(server)
server_path.write_text(server)

# Add service-level tests without depending on runtime installer semantics.
test_path=root/'backend/tests/test_product_artwork_costing.py'
test_path.write_text('''from product_artwork_costing import calculate_artwork_area_cost, _option_policy, _method_key\n\n\ndef test_method_aliases_and_layer_policy():\n    assert _method_key("DTF Transfers") == "dtf"\n    assert _method_key("Heat Transfer Vinyl") == "htv"\n    assert _option_policy({}, "dtf") is True\n    assert _option_policy({"layer_pricing_mode":"separate"}, "dtf") is False\n\n\ndef test_area_rate_wrapper_preserves_base_and_applies_outsourced_costing():\n    def base(slot, area, option):\n        return {"calculation_type":"area_fixed_rate","area_cm2":100,"calculated_print_cost":1,"base_marker":"kept"}\n    result=calculate_artwork_area_cost(\n        base,\n        {"combined_area_cm2":100},\n        {},\n        {"calculation_type":"area_fixed_rate","cost_per_cm2":0.5,"minimum_area_cm2":0,"minimum_print_cost":0,"application_cost":0,"waste_percentage":0,"markup_percentage":0},\n    )\n    assert result["base_marker"] == "kept"\n    assert result["area_cm2"] == 100\n    assert result["calculated_print_cost"] == 50\n    assert result["pricing_source"] == "outsourced_area_rate"\n''')
print('artwork costing carveout applied')
