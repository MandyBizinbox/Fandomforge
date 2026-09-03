from pathlib import Path

page = Path('frontend/src/pages/AdminDashboard.jsx')
text = page.read_text()
original_lines = len(text.splitlines())

required = [
    'const blankTemplate =',
    'function ProductsAdmin()',
    'function ProductTemplatesAdmin()',
    'function ProductTemplateStudio()',
    'const PRINT_METHOD_PRESETS =',
    'function PrintOptionsAdmin()',
    'function ProductFormAdmin()',
    'function ProductsTemplatesWorkspace(',
    '<Route path="product-templates" element={<ProductsTemplatesWorkspace',
    '<Route path="product-templates/new" element={<ProductTemplateStudioPage />} />',
    '<Route path="product-templates/:id" element={<ProductTemplateStudioPage />} />',
]
for token in required:
    if token not in text:
        raise SystemExit(f'missing expected token: {token}')

# Guard dead-generation assumptions before deletion.
for token, expected in [
    ('function ProductTemplatesAdmin()', 1),
    ('function ProductTemplateStudio()', 1),
    ('function PrintOptionsAdmin()', 1),
]:
    if text.count(token) != expected:
        raise SystemExit(f'unexpected definition count for {token}: {text.count(token)}')
if '<ProductTemplatesAdmin' in text:
    raise SystemExit('old ProductTemplatesAdmin unexpectedly rendered')
if '<ProductTemplateStudio ' in text or '<ProductTemplateStudio/>' in text or '<ProductTemplateStudio />' in text:
    raise SystemExit('old ProductTemplateStudio unexpectedly rendered')

workspace_dir = Path('frontend/src/components/admin/products')
workspace_dir.mkdir(parents=True, exist_ok=True)

# Extract the still-live sellable-products table.
products_start = text.index('function ProductsAdmin()')
products_end = text.index('function ProductTemplatesAdmin()')
products_block = text[products_start:products_end].rstrip() + '\n'
products_block = products_block.replace('function ProductsAdmin()', 'export default function AdminProductsList()', 1)
products_module = '''import React, { useEffect, useState } from "react";\nimport { useNavigate } from "react-router-dom";\nimport { Plus } from "lucide-react";\nimport { toast } from "sonner";\nimport { http } from "../../../lib/api";\nimport StatusBadge from "../../StatusBadge";\n\nfunction money(value) { return `R ${Number(value || 0).toFixed(2)}`; }\n\n''' + products_block
(workspace_dir / 'AdminProductsList.jsx').write_text(products_module)

# Remove old template helper prelude, ProductsAdmin, and dead inline template generation.
prefix_start = text.index('const blankTemplate =')
legacy_template_end = text.index('const PRINT_METHOD_PRESETS =')
text = text[:prefix_start] + text[legacy_template_end:]

# Remove the old editable Print Options generation up to ProductFormAdmin.
print_options_start = text.index('const PRINT_METHOD_PRESETS =')
product_form_start = text.index('function ProductFormAdmin()')
text = text[:print_options_start] + '''function splitCsv(value) {\n  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);\n}\n\nfunction money(value) {\n  return `R ${Number(value || 0).toFixed(2)}`;\n}\n\n''' + text[product_form_start:]

# Extract Products & Templates workspace, dropping legacy Print Options tab and pointing users to canonical Manufacturing Rules.
workspace_start = text.index('function ProductsTemplatesWorkspace(')
workspace_end = text.index('export default function AdminDashboard(')
workspace_block = text[workspace_start:workspace_end].rstrip() + '\n'
text = text[:workspace_start] + text[workspace_end:]
workspace_block = workspace_block.replace('function ProductsTemplatesWorkspace(', 'export default function ProductsTemplatesWorkspace(', 1)
workspace_block = workspace_block.replace('<ProductsAdmin />', '<AdminProductsList />')
legacy_tab = '          { key: "print-options", label: "Print Options", permission: "manage_product_templates", moduleKey: "product_templates_enabled", element: <PrintOptionsAdmin /> },\n'
if legacy_tab not in workspace_block:
    raise SystemExit('legacy Print Options tab anchor missing')
workspace_block = workspace_block.replace(legacy_tab, '')
workspace_block = workspace_block.replace(
    '<p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Product templates, categories, attributes and print options now live together because they form one template-management workflow.</p>',
    '<p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Product types, templates, sellable products, categories and attributes live here. Print methods, colours and costing rules are managed in Manufacturing Rules.</p>\n        <button type="button" onClick={() => navigate("/admin/manufacturing-rules")} className="ff-admin-button ff-admin-button--secondary mt-4">Open Manufacturing Rules</button>'
)
workspace_module = '''import React from "react";\nimport { useNavigate } from "react-router-dom";\nimport AdminWorkspaceTabs from "../workspaces/AdminWorkspaceTabs";\nimport ProductTypesPage from "../../template-studio/ProductTypesPage";\nimport ProductTemplatesPage from "../../template-studio/ProductTemplatesPage";\nimport CategoriesAdmin from "../../../pages/admin/CategoriesAdmin";\nimport AttributesAdmin from "../../../pages/admin/AttributesAdmin";\nimport AdminProductsList from "./AdminProductsList";\n\n''' + workspace_block
workspace_module = workspace_module.replace('export default function ProductsTemplatesWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {', 'export default function ProductsTemplatesWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {\n  const navigate = useNavigate();', 1)
(workspace_dir / 'ProductsTemplatesWorkspace.jsx').write_text(workspace_module)

# Parent imports extracted live workspace/list no longer needs old template list/editor imports.
anchor = 'import PlatformSettingsWorkspace from "../components/admin/workspaces/PlatformSettingsWorkspace";\n'
if anchor not in text:
    raise SystemExit('workspace import anchor missing')
text = text.replace(anchor, anchor + 'import ProductsTemplatesWorkspace from "../components/admin/products/ProductsTemplatesWorkspace";\n', 1)

# Remove exact duplicate self-redirect route; the real workspace route remains.
duplicate_route = '        <Route path="product-templates" element={<Navigate to={`${basePath}/product-templates`} replace />} />\n'
if text.count(duplicate_route) != 1:
    raise SystemExit(f'expected one duplicate product-templates redirect, found {text.count(duplicate_route)}')
text = text.replace(duplicate_route, '', 1)

# Remove imports that belonged solely to removed inline generations / extracted workspace.
for line in [
    'import ProductTypesPage from "../components/template-studio/ProductTypesPage";\n',
    'import ProductTemplatesPage from "../components/template-studio/ProductTemplatesPage";\n',
    'import CategoriesAdmin from "./admin/CategoriesAdmin";\n',
    'import AttributesAdmin from "./admin/AttributesAdmin";\n',
    'import { http, assetUrl } from "../lib/api";\n',
]:
    if line in text:
        if 'assetUrl' in line:
            text = text.replace(line, 'import { http } from "../lib/api";\n', 1)
        else:
            text = text.replace(line, '', 1)

# Trim hooks/icons that were old Template Studio-only. Build catches anything incorrectly removed.
text = text.replace('import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";', 'import React, { useCallback, useEffect, useMemo, useState } from "react";', 1)
for icon_line in [
    '  Tag,\n', '  Layers,\n', '  Brush,\n', '  Image as ImageIcon,\n', '  SquareDashedMousePointer,\n', '  Trash2,\n', '  Save,\n', '  Copy,\n', '  Wand2,\n', '  Grid3X3,\n', '  Calculator,\n', '  ChevronLeft,\n',
]:
    text = text.replace(icon_line, '', 1)

page.write_text(text)
updated = page.read_text()

for forbidden in [
    'const blankTemplate =',
    'function ProductTemplatesAdmin()',
    'function PrintAreaCanvas(',
    'function ProductTemplateStudio()',
    'function PrintOptionsAdmin()',
    'const PRINT_METHOD_PRESETS =',
    'function ProductsTemplatesWorkspace(',
    'function ProductsAdmin()',
]:
    if forbidden in updated:
        raise SystemExit(f'legacy/live extraction incomplete: {forbidden}')
for required_token in [
    'import ProductsTemplatesWorkspace from "../components/admin/products/ProductsTemplatesWorkspace";',
    '<Route path="product-templates" element={<ProductsTemplatesWorkspace',
    '<Route path="product-templates/new" element={<ProductTemplateStudioPage />} />',
    '<Route path="product-templates/:id" element={<ProductTemplateStudioPage />} />',
]:
    if required_token not in updated:
        raise SystemExit(f'current template route wiring missing: {required_token}')
if 'element={<PrintOptionsAdmin />}' in updated:
    raise SystemExit('legacy Print Options UI still mounted')

new_lines = len(updated.splitlines())
removed = original_lines - new_lines
if removed < 600:
    raise SystemExit(f'expected large legacy cleanup, only removed {removed} lines ({original_lines}->{new_lines})')
print(f'AdminDashboard lines: {original_lines} -> {new_lines} ({removed} removed)')
print('Dead inline Template Studio and legacy Print Options editor removed; canonical current Studio + Manufacturing Rules preserved')
