from pathlib import Path

p = Path('frontend/src/pages/AdminDashboard.jsx')
s = p.read_text()
start = s.index('function splitCsv(value) {')
end = s.index('export default function AdminDashboard')
block = s[start:end]
for token in ['function ProductFormAdmin()', 'function ProductionAdmin()', 'function CreatorsWorkspace(', 'function PrintersWorkspace(']:
    assert token in block, token
# Exact JSX/function references only; do not confuse legacy CreatorsWorkspace with live AdminCreatorsWorkspace.
tail = s[end:]
for token in ['<ProductFormAdmin', '<ProductionAdmin', '<CreatorsWorkspace', '<PrintersWorkspace', '<BandsAdmin', '<ProductsAdmin']:
    assert token not in tail, f'{token} still referenced by live shell'
s = s[:start] + s[end:]
remove_lines = [
'import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";\n',
'import AdminWorkspaceTabs from "../components/admin/workspaces/AdminWorkspaceTabs";\n',
'import LegacyPrintersAdmin from "../components/admin/legacy/LegacyPrintersAdmin";\n',
'import ProductionJobCard from "../components/production/ProductionJobCard";\n',
'import ActivityTimeline from "../components/activity/ActivityTimeline";\n',
'import NotificationList from "../components/notifications/NotificationList";\n',
'import PaystackPayoutsAdmin from "../components/admin/PaystackPayoutsAdmin";\n',
'import PaymentGatewaySettings from "../components/admin/PaymentGatewaySettings";\n',
'import EmailSettings from "../components/admin/EmailSettings";\n',
'import ShippingSettings from "../components/admin/ShippingSettings";\n',
'import FeaturePackageSettings from "../components/admin/FeaturePackageSettings";\n',
'import SubscriptionManagerAdmin from "../components/admin/SubscriptionManagerAdmin";\n',
'import SubscriptionBillingSettings from "../components/admin/SubscriptionBillingSettings";\n',
'import InstanceBrandingSettings from "../components/admin/InstanceBrandingSettings";\n',
'import AttributeVariationEditor from "../components/AttributeVariationEditor";\n',
'import StatusBadge from "../components/StatusBadge";\n',
'import { toast } from "sonner";\n',
'import {\n  Users,\n  Package,\n  Percent,\n  Plus,\n} from "lucide-react";\n',
]
for line in remove_lines:
    assert line in s, f'missing import {line!r}'
    s = s.replace(line, '')
if 'from "react-router-dom"' not in s:
    s = s.replace('import React, { useCallback, useEffect, useMemo, useState } from "react";\n', 'import React, { useCallback, useEffect, useMemo, useState } from "react";\nimport { Navigate, Route, Routes } from "react-router-dom";\n')
anchor = 'import AdminOverview from "../components/admin/dashboard/AdminOverview";\n'
s = s.replace(anchor, anchor + 'import AdminActivityPage from "../components/admin/dashboard/AdminActivityPage";\nimport AdminNotificationsPage from "../components/admin/dashboard/AdminNotificationsPage";\n')
s = s.replace('<Route path="notifications" element={<AdminNotifications />} />', '<Route path="notifications" element={<AdminNotificationsPage />} />')
s = s.replace('<Route path="activity" element={<ActivityAdmin />} />', '<Route path="activity" element={<AdminActivityPage />} />')
p.write_text(s)

Path('frontend/src/components/admin/dashboard/AdminNotificationsPage.jsx').write_text('''import React from "react";\nimport NotificationList from "../../notifications/NotificationList";\n\nexport default function AdminNotificationsPage() {\n  return (\n    <NotificationList\n      endpoint="/admin/notifications"\n      title="Notifications"\n      subtitle="Admin workflow alerts, artwork reviews, production updates and internal notes"\n    />\n  );\n}\n''')
Path('frontend/src/components/admin/dashboard/AdminActivityPage.jsx').write_text('''import React from "react";\nimport ActivityTimeline from "../../activity/ActivityTimeline";\n\nexport default function AdminActivityPage() {\n  return (\n    <div data-testid="admin-activity-page" className="ff-admin-page">\n      <div className="ff-admin-page__inner">\n        <div className="overline mb-2">Platform</div>\n        <h1 className="font-display text-5xl uppercase mb-8">Activity Log</h1>\n        <ActivityTimeline endpoint="/admin/activity-log" title="Recent Platform Activity" canAddNote={false} />\n      </div>\n    </div>\n  );\n}\n''')
print('AdminDashboard final shell extraction complete')
