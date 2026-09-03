from pathlib import Path

root = Path('frontend/src/components/admin')
css_path = Path('frontend/src/styles/platform-foundation.css')


def require(text, token, label):
    if token not in text:
        raise SystemExit(f'missing {label}: {token}')

# ------------------------------------------------------------------
# Shipping: extract field/rendering shell, keep API orchestration in page.
# ------------------------------------------------------------------
shipping_path = root / 'ShippingSettings.jsx'
shipping = shipping_path.read_text()
require(shipping, 'function TextInput(', 'shipping TextInput')
require(shipping, 'function MethodShell(', 'shipping MethodShell')
require(shipping, 'export default function ShippingSettings()', 'shipping page')

ship_start = shipping.index('function TextInput(')
ship_end = shipping.index('export default function ShippingSettings()')
ship_helpers = shipping[ship_start:ship_end].rstrip() + '\n'
shipping = shipping[:ship_start] + shipping[ship_end:]
shipping = shipping.replace('const MASKED_SECRET = "********";\n\n', '')
shipping = shipping.replace(
    'import { toast } from "sonner";\n',
    'import { toast } from "sonner";\nimport { FieldRenderer, MethodShell, TextInput } from "./shipping/ShippingMethodFields";\n',
    1,
)
shipping = shipping.replace('className="card text-sm text-[var(--ff-muted-text)]"', 'className="ff-admin-card text-sm ff-admin-muted"')
shipping = shipping.replace('className="card h-fit space-y-2"', 'className="ff-admin-card h-fit space-y-2"')
shipping = shipping.replace(
    'className={`w-full text-left border p-3 ${activeKey === method.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]/10" : "border-[var(--ff-card-border)] hover:border-[var(--ff-card-border)]"}`}',
    'className={`ff-admin-method-link w-full text-left p-3 ${activeKey === method.key ? "is-active" : ""}`}',
)
shipping = shipping.replace('"text-[#34C759]"', '"ff-admin-success-text"')
shipping = shipping.replace('text-[var(--ff-muted-text)]', 'ff-admin-muted')
shipping_path.write_text(shipping)

ship_helpers = ship_helpers.replace('className="label"', 'className="ff-admin-label"')
ship_helpers = ship_helpers.replace('className="input-base', 'className="ff-admin-control')
ship_helpers = ship_helpers.replace('text-[var(--ff-muted-text)]', 'ff-admin-muted')
ship_helpers = ship_helpers.replace('border border-[var(--ff-card-border)] p-3 bg-[var(--ff-card-bg)]', 'ff-admin-subpanel p-3')
ship_helpers = ship_helpers.replace('border-[#34C759]/50 text-[#34C759]', 'ff-admin-success-border ff-admin-success-text')
ship_helpers = ship_helpers.replace('className="card space-y-5"', 'className="ff-admin-card space-y-5"')
ship_helpers = ship_helpers.replace('className="btn-primary whitespace-nowrap"', 'className="ff-admin-button ff-admin-button--primary whitespace-nowrap"')
ship_module = '''import React from "react";\n\nconst MASKED_SECRET = "********";\n\n''' + ship_helpers
for name in ['TextInput', 'ToggleRow', 'FieldRenderer', 'MethodShell']:
    ship_module = ship_module.replace(f'function {name}(', f'export function {name}(', 1)
ship_dir = root / 'shipping'
ship_dir.mkdir(parents=True, exist_ok=True)
(ship_dir / 'ShippingMethodFields.jsx').write_text(ship_module)

# ------------------------------------------------------------------
# Payments: extract common gateway UI and setup URL helpers.
# ------------------------------------------------------------------
payment_path = root / 'PaymentGatewaySettings.jsx'
payment = payment_path.read_text()
require(payment, 'const gatewayLabels = {', 'gateway labels')
require(payment, 'function TextInput(', 'payment TextInput')
require(payment, 'function GatewayShell(', 'payment GatewayShell')
require(payment, 'export default function PaymentGatewaySettings()', 'payment page')
labels_start = payment.index('const gatewayLabels = {')
labels_end = payment.index('const CHANNEL_OPTIONS = [')
labels_block = payment[labels_start:labels_end].rstrip() + '\n\n'
pay_start = payment.index('function TextInput(')
pay_end = payment.index('export default function PaymentGatewaySettings()')
pay_helpers = payment[pay_start:pay_end].rstrip() + '\n'
payment = payment[:labels_start] + payment[labels_end:pay_start] + payment[pay_end:]
payment = payment.replace(
    'import { toast } from "sonner";\n',
    'import { toast } from "sonner";\nimport { GatewayShell, PaystackSetupUrls, TextInput, gatewayLabels } from "./payments/PaymentGatewayFields";\n',
    1,
)
payment = payment.replace('className="card text-[var(--ff-muted-text)]"', 'className="ff-admin-card ff-admin-muted"')
payment = payment.replace('text-[var(--ff-muted-text)]', 'ff-admin-muted')
payment = payment.replace(
    'className={`px-4 py-3 border text-xs uppercase tracking-widest font-bold ${activeKey === gateway.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}',
    'className={`ff-admin-section-link ${activeKey === gateway.key ? "is-active" : ""}`}',
)
payment = payment.replace('text-[#34C759]', 'ff-admin-success-text')
payment = payment.replace('className="label"', 'className="ff-admin-label"')
payment = payment.replace('className="input-base', 'className="ff-admin-control')
payment = payment.replace('className="border border-[var(--ff-card-border)] p-3 text-sm flex items-center gap-2"', 'className="ff-admin-subpanel p-3 text-sm flex items-center gap-2"')
payment_path.write_text(payment)

pay_helpers = pay_helpers.replace('className="label"', 'className="ff-admin-label"')
pay_helpers = pay_helpers.replace('className="input-base', 'className="ff-admin-control')
pay_helpers = pay_helpers.replace('text-[var(--ff-muted-text)]', 'ff-admin-muted')
pay_helpers = pay_helpers.replace('border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4', 'ff-admin-subpanel p-4')
pay_helpers = pay_helpers.replace('border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-5', 'ff-admin-card p-5')
pay_helpers = pay_helpers.replace('className="btn-primary w-full"', 'className="ff-admin-button ff-admin-button--primary w-full"')
pay_module = 'import React from "react";\nimport { toast } from "sonner";\n\n' + labels_block + pay_helpers
pay_module = pay_module.replace('const gatewayLabels = {', 'export const gatewayLabels = {', 1)
for name in ['TextInput', 'PaystackSetupUrls', 'GatewayShell']:
    pay_module = pay_module.replace(f'function {name}(', f'export function {name}(', 1)
pay_dir = root / 'payments'
pay_dir.mkdir(parents=True, exist_ok=True)
(pay_dir / 'PaymentGatewayFields.jsx').write_text(pay_module)

# ------------------------------------------------------------------
# User Access: extract all panels/constants/helpers from the page controller.
# ------------------------------------------------------------------
access_path = root / 'UserAccessAdmin.jsx'
access = access_path.read_text()
require(access, 'const SYSTEM_ROLES = [', 'access constants')
require(access, 'function MembershipManager(', 'membership manager')
require(access, 'export default function UserAccessAdmin()', 'access page')
access_start = access.index('const SYSTEM_ROLES = [')
access_end = access.index('export default function UserAccessAdmin()')
access_panels = access[access_start:access_end].rstrip() + '\n'
access = access[:access_start] + access[access_end:]
access = access.replace('import StatusBadge from "../StatusBadge";\n', '')
access = access.replace(
    'import { Shield, Users, UserPlus, Search, Save, KeyRound, Link as LinkIcon } from "lucide-react";\n',
    'import { Search } from "lucide-react";\nimport { DEFAULT_MANAGER_PERMISSIONS, MembershipManager, Pill, SectionHeader, UserForm, UsersTable, emptyUserForm } from "./access/UserAccessPanels";\n',
    1,
)
access = access.replace(
    'className={`px-4 py-2 border text-xs uppercase tracking-widest font-bold ${tab === key ? "bg-white text-black border-white" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}',
    'className={`ff-admin-section-link ${tab === key ? "is-active" : ""}`}',
)
access = access.replace('className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]"', 'className="text-xs uppercase tracking-widest ff-admin-muted"')
access = access.replace('className="card flex items-center gap-3"', 'className="ff-admin-card flex items-center gap-3"')
access = access.replace('text-[var(--ff-muted-text)]', 'ff-admin-muted')
access_path.write_text(access)

# Rebuild panel module imports and exports.
access_panels = access_panels.replace('function emptyUserForm()', 'function emptyUserForm()', 1)
access_panels = access_panels.replace('className="card', 'className="ff-admin-card')
access_panels = access_panels.replace('className="label"', 'className="ff-admin-label"')
access_panels = access_panels.replace('className="input-base', 'className="ff-admin-control')
access_panels = access_panels.replace('text-[var(--ff-muted-text)]', 'ff-admin-muted')
access_panels = access_panels.replace('className="btn-primary', 'className="ff-admin-button ff-admin-button--primary')
access_panels = access_panels.replace('className="border border-[var(--ff-card-border)] overflow-x-auto"', 'className="ff-admin-card p-0 overflow-x-auto"')
# Generic bordered interior panels become semantic subpanels.
access_panels = access_panels.replace('className="border border-[var(--ff-card-border)] p-4"', 'className="ff-admin-subpanel p-4"')
access_panels = access_panels.replace('className="border border-[var(--ff-card-border)] p-3 text-sm ff-admin-muted"', 'className="ff-admin-subpanel p-3 text-sm ff-admin-muted"')
# Fix the only hook warning in the extracted membership manager.
access_panels = access_panels.replace(
    '  const loadRows = () => {\n    if (!selectedId) { setRows([]); return; }\n    http.get(`/admin/${endpoint}/${selectedId}/users`).then((r) => setRows(r.data || [])).catch((e) => toast.error(e.response?.data?.detail || "Could not load users"));\n  };\n\n  useEffect(() => { loadRows(); }, [selectedId]);',
    '  const loadRows = useCallback(() => {\n    if (!selectedId) { setRows([]); return; }\n    http.get(`/admin/${endpoint}/${selectedId}/users`).then((r) => setRows(r.data || [])).catch((e) => toast.error(e.response?.data?.detail || "Could not load users"));\n  }, [endpoint, selectedId]);\n\n  useEffect(() => { loadRows(); }, [loadRows]);',
)
access_module = '''import React, { useCallback, useEffect, useMemo, useState } from "react";\nimport { http } from "../../../lib/api";\nimport StatusBadge from "../../StatusBadge";\nimport { toast } from "sonner";\nimport { Shield, Save, Link as LinkIcon } from "lucide-react";\n\n''' + access_panels
access_module += '\nexport { DEFAULT_MANAGER_PERMISSIONS, MembershipManager, Pill, SectionHeader, UserForm, UsersTable, emptyUserForm };\n'
access_dir = root / 'access'
access_dir.mkdir(parents=True, exist_ok=True)
(access_dir / 'UserAccessPanels.jsx').write_text(access_module)

# Add one missing semantic admin success helper used by settings status indicators.
css = css_path.read_text()
if '.ff-admin-success-text' not in css:
    css += '\n.ff-admin-success-text {\n  color: var(--ff-success, #16a34a);\n}\n'
css_path.write_text(css)

# Structural guards: controllers should now be meaningfully smaller and extracted
# modules must contain the moved responsibilities.
for path, forbidden in [
    (shipping_path, ['function TextInput(', 'function MethodShell(']),
    (payment_path, ['function TextInput(', 'function GatewayShell(']),
    (access_path, ['function UserForm(', 'function MembershipManager(', 'const SYSTEM_ROLES = [']),
]:
    text = path.read_text()
    for token in forbidden:
        if token in text:
            raise SystemExit(f'extraction failed for {path}: {token} remains')

for path in [ship_dir / 'ShippingMethodFields.jsx', pay_dir / 'PaymentGatewayFields.jsx', access_dir / 'UserAccessPanels.jsx']:
    if not path.exists() or path.stat().st_size < 500:
        raise SystemExit(f'extracted module missing/too small: {path}')

print('Admin settings modules extracted and migrated to semantic admin primitives')
