from pathlib import Path
import ast

routes_path = Path('backend/routes_main.py')
server_path = Path('backend/server.py')
test_path = Path('backend/tests/test_builder_text_artwork_patch.py')
routes = routes_path.read_text()
server = server_path.read_text()

# Import canonical generated-text service.
anchor = '''from product_normalization_service import (\n    normalize_builder_product_payload,\n    copy_production_snapshot,\n    product_save_http_exception,\n)\n'''
assert anchor in routes
addition = '''from generated_text_artwork import (\n    materialize_text_slot,\n    materialize_product_artworks,\n    copy_text_metadata_to_snapshot,\n)\n'''
assert addition not in routes
routes = routes.replace(anchor, anchor + addition, 1)

# Rename the canonical slot normalizer core and wrap it directly.
tree = ast.parse(routes)
funcs = {n.name: n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
assert '_normalize_product_artwork_slot' in funcs
node = funcs['_normalize_product_artwork_slot']
lines = routes.splitlines(keepends=True)
idx = node.lineno - 1
assert 'def _normalize_product_artwork_slot(' in lines[idx]
lines[idx] = lines[idx].replace('def _normalize_product_artwork_slot(', 'def _normalize_product_artwork_slot_core(', 1)
routes = ''.join(lines)

tree = ast.parse(routes)
funcs = {n.name: n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
node = funcs['_normalize_product_artwork_slot_core']
insert_at = node.end_lineno
wrapper = '''\n\ndef _normalize_product_artwork_slot(row: dict, index: int = 0) -> dict:\n    slot = _normalize_product_artwork_slot_core(row, index)\n    return materialize_text_slot(slot)\n'''
lines = routes.splitlines(keepends=True)
lines[insert_at:insert_at] = [wrapper]
routes = ''.join(lines)

# Upgrade the already-canonical production snapshot wrapper to materialize text first
# and preserve editable metadata afterwards.
old_snapshot = '''def _build_production_snapshot(product: dict, template, product_variation, quantity: int) -> dict:\n    snapshot = _build_production_snapshot_core(product, template, product_variation, quantity)\n    return copy_production_snapshot(product or {}, snapshot)\n'''
new_snapshot = '''def _build_production_snapshot(product: dict, template, product_variation, quantity: int) -> dict:\n    prepared_product = materialize_product_artworks(product or {})\n    snapshot = _build_production_snapshot_core(prepared_product, template, product_variation, quantity)\n    snapshot = copy_production_snapshot(prepared_product, snapshot)\n    return copy_text_metadata_to_snapshot(snapshot, prepared_product)\n'''
assert old_snapshot in routes
routes = routes.replace(old_snapshot, new_snapshot, 1)
ast.parse(routes)
routes_path.write_text(routes)

# Remove runtime text monkey-patch installation from server startup.
for old in [
    'from builder_text_artwork_patch import install_builder_text_artwork_patch\n',
    'install_builder_text_artwork_patch(routes_main_module)\n',
]:
    assert old in server, old
    server = server.replace(old, '')
ast.parse(server)
server_path.write_text(server)

# Rewrite tests against ordinary service functions rather than an installer.
assert test_path.exists()
test_path.write_text('''from __future__ import annotations\n\nfrom urllib.parse import quote\n\nimport pytest\nfrom fastapi import HTTPException\n\nimport generated_text_artwork as text_artwork\n\n\ndef text_slot(text="Forge It", font="Montserrat", colour="#ff8c01"):\n    svg = (\n        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">'\n        f'<text font-family="{font}" fill="{colour}">{text}</text>'\n        "</svg>"\n    )\n    return {\n        "id": "text-1", "text_layer": True, "text_content": text,\n        "text_font_family": font, "text_font_weight": "700",\n        "text_font_size": 160, "text_color": colour,\n        "original_url": f"data:image/svg+xml;charset=utf-8,{quote(svg)}",\n        "file_name": "forge-it.svg", "mime_type": "image/svg+xml",\n        "print_area_id": "front",\n        "placement": {"x": 10, "y": 20, "width": 60, "height": 25, "rotation": 0},\n    }\n\n\ndef test_materialises_text_layer_as_stable_svg_file(tmp_path, monkeypatch):\n    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)\n    first = text_artwork.materialize_text_slot(text_slot())\n    second = text_artwork.materialize_text_slot(text_slot())\n    assert first["original_url"] == second["original_url"]\n    assert first["original_url"].startswith("/api/uploads/product-artwork/text/")\n    assert first["generated_artwork_file"] is True\n    generated = tmp_path / first["original_url"].rsplit("/", 1)[-1]\n    assert generated.exists()\n    assert b"Forge It" in generated.read_bytes()\n\n\ndef test_text_without_browser_data_url_gets_generated_and_materialised(tmp_path, monkeypatch):\n    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)\n    slot = text_slot()\n    slot.pop("original_url")\n    saved = text_artwork.materialize_text_slot(slot)\n    assert saved["original_url"].startswith("/api/uploads/product-artwork/text/")\n    assert saved["generated_artwork_file"] is True\n\n\ndef test_rejects_executable_svg(tmp_path, monkeypatch):\n    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)\n    bad = text_slot()\n    bad["original_url"] = "data:image/svg+xml,%3Csvg%3E%3Cscript%3Ealert(1)%3C/script%3E%3C/svg%3E"\n    with pytest.raises(HTTPException) as exc:\n        text_artwork.materialize_text_slot(bad)\n    assert exc.value.status_code == 400\n\n\ndef test_snapshot_receives_stable_url_and_editable_metadata(tmp_path, monkeypatch):\n    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)\n    slot = text_artwork.materialize_text_slot(text_slot())\n    product = {"artworks": [slot], "artwork_groups": [{"id":"g1","artworks":[slot]}], "artwork": slot}\n    snapshot = {\n        "artwork": {"id": slot["id"], "url": slot["original_url"]},\n        "artworks": [{"id": slot["id"], "url": slot["original_url"]}],\n    }\n    result = text_artwork.copy_text_metadata_to_snapshot(snapshot, product)\n    assert result["artwork"]["text_content"] == "Forge It"\n    assert result["artwork"]["text_font_family"] == "Montserrat"\n    assert result["artworks"][0]["generated_artwork_file"] is True\n''')
print('generated text artwork carveout applied')
