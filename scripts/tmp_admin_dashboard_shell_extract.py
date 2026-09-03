from pathlib import Path

page = Path('frontend/src/pages/AdminDashboard.jsx')
text = page.read_text()
original_lines = len(text.splitlines())


def require(token):
    if token not in text:
        raise SystemExit(f'missing expected AdminDashboard token: {token}')

for token in [
    'function buildAdminLinks(',
    'function filterAdminLinks(',
    'function Overview()',
    'const PRINTER_PRODUCT_CAPABILITIES',
    'function PrintersAdmin()',
    'function ProductsAdmin()',
    'export default function AdminDashboard(',
]:
    require(token)

# ---- Navigation: clean contiguous block at the top. ----
nav_start = text.index('function buildAdminLinks(')
nav_end = text.index('const blankTemplate =')
nav_block = text[nav_start:nav_end].rstrip() + '\n'
text = text[:nav_start] + text[nav_end:]
nav_module = '''import React from "react";\nimport { BarChart3, Users, Factory, Package, ShoppingBag, Settings as SettingsIcon, Image as ImageIcon, Clock3, Bell, WalletCards } from "lucide-react";\n\n''' + nav_block
nav_module = nav_module.replace('function buildAdminLinks(', 'export function buildAdminLinks(', 1)
nav_module = nav_module.replace('function filterAdminLinks(', 'export function filterAdminLinks(', 1)
nav_dir = Path('frontend/src/components/admin/dashboard')
nav_dir.mkdir(parents=True, exist_ok=True)
(nav_dir / 'adminNavigation.jsx').write_text(nav_module)

# ---- Overview: extract exact function by matching from Overview to printer constants. ----
overview_start = text.index('function Overview()')
overview_end = text.index('const PRINTER_PRODUCT_CAPABILITIES')
overview_block = text[overview_start:overview_end].rstrip() + '\n'
text = text[:overview_start] + text[overview_end:]
overview_block = overview_block.replace('function Overview()', 'export default function AdminOverview()', 1)
overview_block = overview_block.replace('onClick={() => window.location.assign("/admin/artwork-review")}', 'onClick={() => navigate("/admin/artwork-review")}')
overview_block = overview_block.replace('className="card card-interactive', 'className="ff-admin-card card-interactive')
overview_block = overview_block.replace('className="mt-6 card"', 'className="mt-6 ff-admin-card"')
overview_block = overview_block.replace('text-[#34C759]', 'ff-admin-success-text')
overview_module = '''import React, { useEffect, useState } from "react";\nimport { useNavigate } from "react-router-dom";\nimport { http } from "../../../lib/api";\n\nfunction money(value) { return `R ${Number(value || 0).toFixed(2)}`; }\n\n''' + overview_block
overview_module = overview_module.replace('export default function AdminOverview() {', 'export default function AdminOverview() {\n  const navigate = useNavigate();', 1)
(nav_dir / 'AdminOverview.jsx').write_text(overview_module)

# ---- Legacy Printers: preserve behavior, remove it from the route god-file. ----
printer_start = text.index('const PRINTER_PRODUCT_CAPABILITIES')
printer_end = text.index('function ProductsAdmin()')
printer_block = text[printer_start:printer_end].rstrip() + '\n'
text = text[:printer_start] + text[printer_end:]
printer_block = printer_block.replace('function PrintersAdmin()', 'export default function LegacyPrintersAdmin()', 1)
legacy_dir = Path('frontend/src/components/admin/legacy')
legacy_dir.mkdir(parents=True, exist_ok=True)
legacy_module = '''import React, { useEffect, useState } from "react";\nimport { Plus } from "lucide-react";\nimport { toast } from "sonner";\nimport { http, assetUrl } from "../../../lib/api";\n\n''' + printer_block
(legacy_dir / 'LegacyPrintersAdmin.jsx').write_text(legacy_module)

# Parent now imports the extracted pieces.
insert_after = 'import DashboardLayout from "../components/DashboardLayout";\n'
imports = (
    'import AdminOverview from "../components/admin/dashboard/AdminOverview";\n'
    'import { filterAdminLinks } from "../components/admin/dashboard/adminNavigation";\n'
    'import LegacyPrintersAdmin from "../components/admin/legacy/LegacyPrintersAdmin";\n'
)
if insert_after not in text:
    raise SystemExit('DashboardLayout import anchor missing')
text = text.replace(insert_after, insert_after + imports, 1)
text = text.replace('<Overview />', '<AdminOverview />')
text = text.replace('<PrintersAdmin />', '<LegacyPrintersAdmin />')

# Remove icons that were only used by extracted navigation/printer blocks. Keep any
# remaining icon imports untouched rather than guessing; eslint/build will identify issues.
for icon_line in [
    '  BarChart3,\n', '  Users,\n', '  Factory,\n', '  ShoppingBag,\n', '  Settings as SettingsIcon,\n',
    '  Image as ImageIcon,\n', '  Clock3,\n', '  Bell,\n', '  WalletCards,\n',
]:
    # only remove when identifier is absent from the post-extraction body beyond import block
    identifier = icon_line.strip().rstrip(',').replace('Settings as SettingsIcon', 'SettingsIcon').replace('Image as ImageIcon', 'ImageIcon')
    body = text[text.index('function ProductsAdmin()'):] if 'function ProductsAdmin()' in text else text
    if identifier and identifier not in body:
        text = text.replace(icon_line, '', 1)

page.write_text(text)

# Guards: giant route file no longer owns these responsibilities.
updated = page.read_text()
for forbidden in ['function buildAdminLinks(', 'function filterAdminLinks(', 'function Overview()', 'function PrintersAdmin()', 'const PRINTER_PRODUCT_CAPABILITIES']:
    if forbidden in updated:
        raise SystemExit(f'extraction incomplete: {forbidden} remains in AdminDashboard')
for required in ['<AdminOverview />', '<LegacyPrintersAdmin />', 'filterAdminLinks']:
    if required not in updated:
        raise SystemExit(f'parent wiring missing: {required}')

new_lines = len(updated.splitlines())
print(f'AdminDashboard lines: {original_lines} -> {new_lines} ({original_lines-new_lines} removed from god-file)')
print('Navigation, overview, and retained legacy Printers extracted safely')
