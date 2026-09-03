from pathlib import Path

page = Path('frontend/src/pages/AdminDashboard.jsx')
text = page.read_text()
original_lines = len(text.splitlines())


def require(token):
    if token not in text:
        raise SystemExit(f'missing expected token: {token}')

for token in [
    'function CommissionsAdmin()',
    'function AdminSettings(',
    'function AdminWorkspaceTabs(',
    'function BillingFinanceWorkspace(',
    'function ShopSettingsWorkspace(',
    'function PlatformSettingsWorkspace(',
    'export default function AdminDashboard(',
]:
    require(token)

workspace_dir = Path('frontend/src/components/admin/workspaces')
workspace_dir.mkdir(parents=True, exist_ok=True)
settings_dir = Path('frontend/src/components/admin/settings')
settings_dir.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------
# Extract generic workspace tabs first. Creators/Printers/Product Templates
# remain in AdminDashboard for now but consume this shared component.
# ------------------------------------------------------------------
tabs_start = text.index('function AdminWorkspaceTabs(')
tabs_end = text.index('function CreatorsWorkspace(')
tabs_block = text[tabs_start:tabs_end].rstrip() + '\n'
text = text[:tabs_start] + text[tabs_end:]
tabs_block = tabs_block.replace('function AdminWorkspaceTabs(', 'export default function AdminWorkspaceTabs(', 1)
tabs_block = tabs_block.replace('return <div className="card text-sm text-[var(--ff-muted-text)]">', 'return <div className="ff-admin-card text-sm ff-admin-muted">')
tabs_block = tabs_block.replace(
    'className={`px-4 py-3 border text-xs uppercase tracking-widest font-bold ${active === tab.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}',
    'className={`ff-admin-section-link ${active === tab.key ? "is-active" : ""}`}',
)
(workspace_dir / 'AdminWorkspaceTabs.jsx').write_text(
    'import React, { useEffect, useState } from "react";\n\n' + tabs_block
)

# ------------------------------------------------------------------
# Extract the old AdminSettings implementation intact. It is still capable
# of rendering its historical tabs; Platform Settings currently consumes it
# in compact/general mode only. No API behavior changes in this pass.
# ------------------------------------------------------------------
settings_start = text.index('function AdminSettings(')
settings_end = text.index('function CreatorsWorkspace(')
# After tabs extraction, CreatorsWorkspace is now the next anchor.
settings_block = text[settings_start:settings_end].rstrip() + '\n'
text = text[:settings_start] + text[settings_end:]
settings_block = settings_block.replace('function AdminSettings(', 'export default function AdminPlatformGeneralSettings(', 1)
settings_module = '''import React, { useEffect, useState } from "react";\nimport { http } from "../../../lib/api";\nimport { toast } from "sonner";\nimport PaymentGatewaySettings from "../PaymentGatewaySettings";\nimport ShippingSettings from "../ShippingSettings";\nimport FeaturePackageSettings from "../FeaturePackageSettings";\nimport SubscriptionManagerAdmin from "../SubscriptionManagerAdmin";\nimport SubscriptionBillingSettings from "../SubscriptionBillingSettings";\nimport PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";\n\n''' + settings_block
(settings_dir / 'AdminPlatformGeneralSettings.jsx').write_text(settings_module)

# ------------------------------------------------------------------
# Commission ledger belongs to Billing & Finance, so move it together with
# that workspace rather than leaving a tiny finance island in AdminDashboard.
# ------------------------------------------------------------------
comm_start = text.index('function CommissionsAdmin()')
comm_end = text.index('function CreatorsWorkspace(')
comm_block = text[comm_start:comm_end].rstrip() + '\n'
text = text[:comm_start] + text[comm_end:]

billing_start = text.index('function BillingFinanceWorkspace(')
billing_end = text.index('function ShopSettingsWorkspace(')
billing_block = text[billing_start:billing_end].rstrip() + '\n'
text = text[:billing_start] + text[billing_end:]
billing_block = billing_block.replace('function BillingFinanceWorkspace(', 'export default function BillingFinanceWorkspace(', 1)
billing_block = billing_block.replace('<CommissionsAdmin />', '<CommissionsAdmin />')
comm_block = comm_block.replace('className="card mb-6"', 'className="ff-admin-card mb-6"')
comm_block = comm_block.replace('className="border border-[var(--ff-card-border)]"', 'className="ff-admin-card p-0"')
billing_module = '''import React, { useEffect, useState } from "react";\nimport { http } from "../../../lib/api";\nimport AdminWorkspaceTabs from "./AdminWorkspaceTabs";\nimport SubscriptionBillingSettings from "../SubscriptionBillingSettings";\nimport SubscriptionManagerAdmin from "../SubscriptionManagerAdmin";\nimport PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";\n\nfunction money(value) { return `R ${Number(value || 0).toFixed(2)}`; }\n\n''' + comm_block + '\n' + billing_block
(workspace_dir / 'BillingFinanceWorkspace.jsx').write_text(billing_module)

# ------------------------------------------------------------------
# Shop Settings workspace.
# ------------------------------------------------------------------
shop_start = text.index('function ShopSettingsWorkspace(')
shop_end = text.index('function PlatformSettingsWorkspace(')
shop_block = text[shop_start:shop_end].rstrip() + '\n'
text = text[:shop_start] + text[shop_end:]
shop_block = shop_block.replace('function ShopSettingsWorkspace(', 'export default function ShopSettingsWorkspace(', 1)
shop_module = '''import React from "react";\nimport AdminWorkspaceTabs from "./AdminWorkspaceTabs";\nimport PaymentGatewaySettings from "../PaymentGatewaySettings";\nimport ShippingSettings from "../ShippingSettings";\nimport EmailSettings from "../EmailSettings";\n\n''' + shop_block
(workspace_dir / 'ShopSettingsWorkspace.jsx').write_text(shop_module)

# ------------------------------------------------------------------
# Platform Settings workspace.
# ------------------------------------------------------------------
platform_start = text.index('function PlatformSettingsWorkspace(')
platform_end = text.index('export default function AdminDashboard(')
platform_block = text[platform_start:platform_end].rstrip() + '\n'
text = text[:platform_start] + text[platform_end:]
platform_block = platform_block.replace('function PlatformSettingsWorkspace(', 'export default function PlatformSettingsWorkspace(', 1)
platform_block = platform_block.replace('<AdminSettings initialTab="general" compact />', '<AdminPlatformGeneralSettings initialTab="general" compact />')
platform_module = '''import React from "react";\nimport AdminWorkspaceTabs from "./AdminWorkspaceTabs";\nimport FeaturePackageSettings from "../FeaturePackageSettings";\nimport InstanceBrandingSettings from "../InstanceBrandingSettings";\nimport AdminPlatformGeneralSettings from "../settings/AdminPlatformGeneralSettings";\n\n''' + platform_block
(workspace_dir / 'PlatformSettingsWorkspace.jsx').write_text(platform_module)

# Parent imports the extracted pieces. Existing route names stay unchanged.
anchor = 'import AdminOverview from "../components/admin/dashboard/AdminOverview";\n'
imports = (
    'import AdminWorkspaceTabs from "../components/admin/workspaces/AdminWorkspaceTabs";\n'
    'import BillingFinanceWorkspace from "../components/admin/workspaces/BillingFinanceWorkspace";\n'
    'import ShopSettingsWorkspace from "../components/admin/workspaces/ShopSettingsWorkspace";\n'
    'import PlatformSettingsWorkspace from "../components/admin/workspaces/PlatformSettingsWorkspace";\n'
)
if anchor not in text:
    raise SystemExit('AdminOverview import anchor missing')
text = text.replace(anchor, anchor + imports, 1)

page.write_text(text)

updated = page.read_text()
for forbidden in [
    'function CommissionsAdmin()',
    'function AdminSettings(',
    'function AdminWorkspaceTabs(',
    'function BillingFinanceWorkspace(',
    'function ShopSettingsWorkspace(',
    'function PlatformSettingsWorkspace(',
]:
    if forbidden in updated:
        raise SystemExit(f'extraction incomplete: {forbidden} remains')
for required in [
    '<BillingFinanceWorkspace',
    '<ShopSettingsWorkspace',
    '<PlatformSettingsWorkspace',
    '<AdminWorkspaceTabs',
]:
    if required not in updated:
        raise SystemExit(f'parent wiring missing: {required}')

# New files must be non-trivial and dashboard must shrink meaningfully.
for path in [
    workspace_dir / 'AdminWorkspaceTabs.jsx',
    workspace_dir / 'BillingFinanceWorkspace.jsx',
    workspace_dir / 'ShopSettingsWorkspace.jsx',
    workspace_dir / 'PlatformSettingsWorkspace.jsx',
    settings_dir / 'AdminPlatformGeneralSettings.jsx',
]:
    if not path.exists() or path.stat().st_size < 500:
        raise SystemExit(f'extracted module missing/too small: {path}')

new_lines = len(updated.splitlines())
if original_lines - new_lines < 200:
    raise SystemExit(f'expected meaningful dashboard shrink, got {original_lines} -> {new_lines}')
print(f'AdminDashboard lines: {original_lines} -> {new_lines} ({original_lines-new_lines} removed in settings/workspace pass)')
print('Billing, Shop, Platform Settings and shared workspace tabs extracted with behavior frozen')
