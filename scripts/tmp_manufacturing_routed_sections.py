from pathlib import Path

APP = Path('frontend/src/App.js')
ROUTE = Path('frontend/src/routes/AdminManufacturingRulesRoute.jsx')
PAGE = Path('frontend/src/pages/admin/AdminManufacturingRulesUnified.jsx')

app = APP.read_text()
old_app = '<Route path="/admin/manufacturing-rules" element={<Protected roles={platformRoles}><AdminManufacturingRules /></Protected>} />'
new_app = '<Route path="/admin/manufacturing-rules/*" element={<Protected roles={platformRoles}><AdminManufacturingRules /></Protected>} />'
if app.count(old_app) != 1:
    raise SystemExit(f'Expected one manufacturing App route, found {app.count(old_app)}')
APP.write_text(app.replace(old_app, new_app, 1))

ROUTE.write_text('''import React from "react";\nimport { Navigate, Route, Routes } from "react-router-dom";\nimport "../components/admin/adminManufacturingRulesThemeRuntime";\nimport AdminManufacturingRulesUnified from "../pages/admin/AdminManufacturingRulesUnified";\n\nexport default function AdminManufacturingRulesRoute() {\n  return (\n    <Routes>\n      <Route index element={<Navigate to="methods" replace />} />\n      <Route path="methods" element={<AdminManufacturingRulesUnified activeSection="methods" />} />\n      <Route path="colours" element={<AdminManufacturingRulesUnified activeSection="colours" />} />\n      <Route path="settings" element={<AdminManufacturingRulesUnified activeSection="settings" />} />\n      <Route path="*" element={<Navigate to="methods" replace />} />\n    </Routes>\n  );\n}\n''')

page = PAGE.read_text()

def once(old, new, label):
    global page
    count = page.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    page = page.replace(old, new, 1)

once('import { Link } from "react-router-dom";', 'import { Link, NavLink } from "react-router-dom";', 'router import')
once('export default function AdminManufacturingRulesUnified() {', 'export default function AdminManufacturingRulesUnified({ activeSection = "methods" }) {', 'component signature')
once('  const [activeTab, setActiveTab] = useState("methods");\n', '', 'active tab state')
once('''    <div className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-3">{[["methods", "Print Methods"], ["colours", "Stocked Colours"], ["settings", "Global Settings"]].map(([key, label]) => <button type="button" key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? "btn-primary" : "btn-secondary"}>{label}</button>)}</div>\n\n    {activeTab === "methods" &&''', '''    <nav className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-3" aria-label="Manufacturing rules sections">{[["methods", "Print Methods"], ["colours", "Stocked Colours"], ["settings", "Global Settings"]].map(([key, label]) => <NavLink key={key} to={`/admin/manufacturing-rules/${key}`} className={activeSection === key ? "btn-primary" : "btn-secondary"}>{label}</NavLink>)}</nav>\n\n    {activeSection === "methods" &&''', 'section nav')
page = page.replace('{activeTab === "colours" &&', '{activeSection === "colours" &&')
page = page.replace('{activeTab === "settings" &&', '{activeSection === "settings" &&')
if 'activeTab' in page or 'setActiveTab' in page:
    raise SystemExit('Legacy activeTab state remains in manufacturing page')
PAGE.write_text(page)
