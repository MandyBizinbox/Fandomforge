from pathlib import Path
import ast

ROOT = Path('.')
routes_path = ROOT / 'backend/routes_main.py'
models_path = ROOT / 'backend/models.py'
server_path = ROOT / 'backend/server.py'

routes = routes_path.read_text()
models = models_path.read_text()
server = server_path.read_text()

anchor = 'from artwork_print_job_pricing import aggregate_artwork_print_jobs\n'
assert anchor in routes
service_import = '''from product_normalization_service import (\n    normalize_builder_product_payload,\n    copy_production_snapshot,\n    product_save_http_exception,\n)\n'''
assert service_import not in routes
routes = routes.replace(anchor, anchor + service_import, 1)

tree = ast.parse(routes)
by_name = {node.name: node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
for required in ['normalize_template_product_payload', '_build_production_snapshot', 'admin_create_product', 'admin_update_product']:
    assert required in by_name, required

lines = routes.splitlines(keepends=True)

def rename_def(name, new_name):
    node = by_name[name]
    idx = node.lineno - 1
    old = f'def {name}(' if isinstance(node, ast.FunctionDef) else f'async def {name}('
    new = f'def {new_name}(' if isinstance(node, ast.FunctionDef) else f'async def {new_name}('
    assert old in lines[idx], (name, lines[idx])
    lines[idx] = lines[idx].replace(old, new, 1)

rename_def('normalize_template_product_payload', '_normalize_template_product_payload_core')
rename_def('_build_production_snapshot', '_build_production_snapshot_core')

create_node = by_name['admin_create_product']
create_def_idx = create_node.lineno - 1
for deco in create_node.decorator_list:
    text = ''.join(lines[deco.lineno - 1:deco.end_lineno])
    if '@admin_router.post("/products", response_model=Product)' in text:
        for i in range(deco.lineno - 1, deco.end_lineno):
            lines[i] = ''
        break
else:
    raise AssertionError('admin product create decorator not found')
old = 'async def admin_create_product('
assert old in lines[create_def_idx]
lines[create_def_idx] = lines[create_def_idx].replace(old, 'async def _admin_create_product_core(', 1)

update_node = by_name['admin_update_product']
updated_decorator = False
for deco in update_node.decorator_list:
    text = ''.join(lines[deco.lineno - 1:deco.end_lineno])
    if '@admin_router.patch("/products/{product_id}", response_model=Product)' in text:
        lines[deco.lineno - 1] = '@admin_router.api_route("/products/{product_id}", methods=["PATCH", "PUT"], response_model=Product)\n'
        for i in range(deco.lineno, deco.end_lineno):
            lines[i] = ''
        updated_decorator = True
        break
assert updated_decorator

routes = ''.join(lines)
tree = ast.parse(routes)
by_name = {node.name: node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
node = by_name['_normalize_template_product_payload_core']
insert_at = node.end_lineno
wrapper = '''\n\nasync def normalize_template_product_payload(db, data: dict, creator: dict, user: User, allow_admin_publish: bool = False) -> dict:\n    return await normalize_builder_product_payload(\n        db=db, data=data, creator=creator, user=user,\n        allow_admin_publish=allow_admin_publish,\n        core_normalizer=_normalize_template_product_payload_core,\n    )\n'''
routes_lines = routes.splitlines(keepends=True)
routes_lines[insert_at:insert_at] = [wrapper]
routes = ''.join(routes_lines)

tree = ast.parse(routes)
by_name = {node.name: node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
node = by_name['_build_production_snapshot_core']
insert_at = node.end_lineno
wrapper = '''\n\ndef _build_production_snapshot(product: dict, template, product_variation, quantity: int) -> dict:\n    snapshot = _build_production_snapshot_core(product, template, product_variation, quantity)\n    return copy_production_snapshot(product or {}, snapshot)\n'''
routes_lines = routes.splitlines(keepends=True)
routes_lines[insert_at:insert_at] = [wrapper]
routes = ''.join(routes_lines)

tree = ast.parse(routes)
by_name = {node.name: node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
node = by_name['_admin_create_product_core']
insert_at = node.end_lineno
wrapper = '''\n\n@admin_router.post("/products", response_model=Product)\nasync def admin_create_product(\n    payload: AdminProductCreate,\n    request: Request,\n    user: User = Depends(get_current_user),\n):\n    try:\n        return await _admin_create_product_core(payload=payload, request=request, user=user)\n    except HTTPException:\n        raise\n    except Exception as exc:\n        raise product_save_http_exception(payload, exc) from exc\n'''
routes_lines = routes.splitlines(keepends=True)
routes_lines[insert_at:insert_at] = [wrapper]
routes = ''.join(routes_lines)
ast.parse(routes)
routes_path.write_text(routes)

assert 'class ProductBase(BaseModel):\n' in models
models = models.replace('class ProductBase(BaseModel):\n', 'class ProductBase(BaseModel):\n    model_config = ConfigDict(extra="allow")\n\n', 1)
assert 'class Product(ProductBase):\n    model_config = ConfigDict(extra="ignore")' in models
models = models.replace('class Product(ProductBase):\n    model_config = ConfigDict(extra="ignore")', 'class Product(ProductBase):\n    model_config = ConfigDict(extra="allow")', 1)
assert 'class ProductArtworkGroup(BaseModel):\n    model_config = ConfigDict(extra="ignore")' in models
models = models.replace('class ProductArtworkGroup(BaseModel):\n    model_config = ConfigDict(extra="ignore")', 'class ProductArtworkGroup(BaseModel):\n    model_config = ConfigDict(extra="allow")', 1)
assert 'class ProductUpdate(BaseModel):\n' in models
models = models.replace('class ProductUpdate(BaseModel):\n', 'class ProductUpdate(BaseModel):\n    model_config = ConfigDict(extra="allow")\n\n', 1)
ast.parse(models)
models_path.write_text(models)

for old in [
    'from builder_production_rules_patch import install_builder_production_rules_patch\n',
    'from builder_product_save_patch import install_builder_product_save_patch\n',
    'install_builder_production_rules_patch(routes_main_module)\n',
]:
    assert old in server, old
    server = server.replace(old, '')
assert server.count('install_builder_product_save_patch(routes_main_module)') >= 1
server = server.replace('install_builder_product_save_patch(routes_main_module)\n', '')
server = server.replace('# Install Product Builder save sanitization last so no compatibility layer can\n# replace the normalizer afterwards and reintroduce server-owned Product fields.\n', '')
ast.parse(server)
server_path.write_text(server)

old_test = ROOT / 'backend/tests/test_builder_product_save_patch.py'
assert old_test.exists()
old_test.unlink()
new_test = ROOT / 'backend/tests/test_product_normalization_service.py'
new_test.write_text('''from product_normalization_service import (\n    SERVER_OWNED_PRODUCT_FIELDS, sanitise_product_payload,\n    strip_server_owned_product_fields, copy_production_snapshot,\n)\n\n\ndef test_server_owned_product_fields_are_removed_before_product_construction():\n    payload = {"band_id":"creator-123","slug":"bad","assigned_printer_id":"printer-1","created_by_user_id":"admin-1","created_by_role":"super_admin","created_at":"x","updated_at":"y","title":"Test","template_id":"template-1"}\n    cleaned = strip_server_owned_product_fields(payload)\n    assert cleaned == {"title":"Test","template_id":"template-1"}\n    assert set(SERVER_OWNED_PRODUCT_FIELDS) == {"band_id","slug","assigned_printer_id","created_by_user_id","created_by_role","created_at","updated_at"}\n\n\ndef test_product_payload_sanitization_is_non_mutating_and_removes_variation_mockups():\n    payload = {"title":"Test","variations":[{"size":"M","mockup_images":["x"],"price":299}]}\n    cleaned = sanitise_product_payload(payload)\n    assert payload["variations"][0]["mockup_images"] == ["x"]\n    assert cleaned["variations"] == [{"size":"M","price":299}]\n\n\ndef test_production_snapshot_copies_manufacturing_decisions_and_validation():\n    product = {"production_rule_version":"v2","minimum_selling_price":199,"costing_breakdown":{"manufacturing":42},"production_validation":{"status":"valid","errors":[],"warnings":["note"]}}\n    snapshot = copy_production_snapshot(product, {"costing_breakdown":{"blank":50}})\n    assert snapshot["production_rule_version"] == "v2"\n    assert snapshot["minimum_selling_price"] == 199\n    assert snapshot["costing_breakdown"] == {"blank":50,"manufacturing":42}\n    assert snapshot["validation_status"] == "valid"\n    assert snapshot["validation_warnings"] == ["note"]\n''')

put_test = ROOT / 'backend/tests/test_admin_product_update_put_compat.py'
assert put_test.exists()
put_test.write_text('''from pathlib import Path\n\ndef test_admin_product_update_declares_patch_and_put_methods():\n    source = Path(__file__).resolve().parents[1].joinpath("routes_main.py").read_text()\n    assert '@admin_router.api_route("/products/{product_id}", methods=["PATCH", "PUT"], response_model=Product)' in source\n    assert "install_builder_product_update_put_alias" not in source\n''')

extension_test = ROOT / 'backend/tests/test_builder_extension_state_persistence.py'
assert extension_test.exists()
text = extension_test.read_text()
text = text.replace('from builder_product_save_patch import _enable_builder_extension_state\n', '')
text = text.replace('    _enable_builder_extension_state()\n', '')
extension_test.write_text(text)

print('backend product-normalization carveout applied')
