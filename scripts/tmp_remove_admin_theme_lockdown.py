from pathlib import Path

root = Path(__file__).resolve().parents[1]
css_path = root / "frontend/src/index.css"
layout_path = root / "frontend/src/components/DashboardLayout.jsx"

css = css_path.read_text()
start_marker = '''/* ---------------------------------------------------------\n   Admin workspace fixed operational theme\n   Public branding applies to storefront pages only.\n   Admin/creator/printer dashboards stay dark, red and readable.\n--------------------------------------------------------- */'''
end_marker = '''/* ---------------------------------------------------------\n   Product builder variation matrix containment\n   Keeps large size/colour grids inside the admin content area.\n--------------------------------------------------------- */'''

start = css.find(start_marker)
end = css.find(end_marker)
if start == -1 or end == -1 or end <= start:
    raise SystemExit(f"Could not locate admin lockdown block: start={start}, end={end}")

replacement = '''/* ---------------------------------------------------------\n   Admin workspace semantic theme compatibility\n   Platform Settings owns the active admin palette. These rules only bridge\n   legacy admin classes that have not yet migrated to ff-admin-* primitives.\n--------------------------------------------------------- */\n\n.admin-workspace,\n.admin-workspace main,\n.admin-workspace [data-testid$="-main"] {\n  background: var(--ff-page-bg) !important;\n  color: var(--ff-page-text) !important;\n}\n\n.admin-workspace .admin-sidebar,\n.admin-workspace aside,\n.admin-workspace [data-testid$="-sidebar"],\n.admin-workspace .admin-topbar,\n.admin-workspace main > .sticky,\n.admin-workspace .sticky.top-0 {\n  background: var(--ff-header-bg) !important;\n  color: var(--ff-header-text) !important;\n  border-color: var(--ff-card-border) !important;\n}\n\n.admin-workspace .card,\n.admin-workspace .card-interactive,\n.admin-workspace .surface,\n.admin-workspace .panel,\n.admin-workspace .dropzone,\n.admin-workspace .overflow-x-auto,\n.admin-workspace .table-brutal,\n.admin-workspace .notification-card,\n.admin-workspace .activity-card {\n  background: var(--ff-card-bg) !important;\n  color: var(--ff-card-text) !important;\n  border-color: var(--ff-card-border) !important;\n}\n\n.admin-workspace .overline,\n.admin-workspace .label,\n.admin-workspace [class*="text-zinc"],\n.admin-workspace [class*="text-[var(--ff-muted-text)]"] {\n  color: var(--ff-muted-text) !important;\n}\n\n.admin-workspace .input-base,\n.admin-workspace input,\n.admin-workspace select,\n.admin-workspace textarea,\n.admin-workspace option {\n  background: var(--ff-input-bg) !important;\n  color: var(--ff-input-text) !important;\n  border-color: var(--ff-input-border) !important;\n  color-scheme: normal !important;\n}\n\n.admin-workspace input::placeholder,\n.admin-workspace textarea::placeholder {\n  color: var(--ff-muted-text) !important;\n}\n\n.admin-workspace .btn-primary,\n.admin-workspace .btn-primary * {\n  background: var(--ff-button-primary-bg) !important;\n  color: var(--ff-button-primary-text) !important;\n  border-color: var(--ff-button-primary-border) !important;\n}\n\n.admin-workspace .btn-primary:hover,\n.admin-workspace .btn-primary:hover * {\n  background: var(--ff-button-alternate-bg) !important;\n  color: var(--ff-button-alternate-text) !important;\n  border-color: var(--ff-button-alternate-border) !important;\n}\n\n.admin-workspace .btn-secondary,\n.admin-workspace .btn-secondary * {\n  background: var(--ff-button-alternate-bg) !important;\n  color: var(--ff-button-alternate-text) !important;\n  border-color: var(--ff-button-secondary-idle-border) !important;\n}\n\n.admin-workspace .sidebar-link {\n  color: var(--ff-muted-text) !important;\n}\n\n.admin-workspace .sidebar-link:hover,\n.admin-workspace .sidebar-link.active {\n  color: var(--ff-header-text) !important;\n  background: color-mix(in srgb, var(--ff-primary) 12%, transparent) !important;\n}\n\n.admin-workspace .sidebar-link.active {\n  border-left-color: var(--ff-primary) !important;\n}\n\n.admin-workspace .table-brutal th {\n  color: var(--ff-muted-text) !important;\n  border-color: var(--ff-card-border) !important;\n}\n\n.admin-workspace .table-brutal td {\n  color: var(--ff-card-text) !important;\n  border-color: var(--ff-card-border) !important;\n}\n\n.admin-workspace .admin-image-well,\n.admin-workspace .template-preview-well {\n  background: var(--ff-surface-bg) !important;\n  color: var(--ff-surface-text) !important;\n  border-color: var(--ff-card-border) !important;\n}\n\n'''

css = css[:start] + replacement + css[end:]
if "Admin shell hard override" in css or "--admin-bg:" in css:
    raise SystemExit("Legacy admin lockdown markers remain")
css_path.write_text(css)

layout = layout_path.read_text()
old = 'className="w-20 lg:w-64 admin-sidebar border-r border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-card-text)] flex flex-col min-h-screen sticky top-0"'
new = 'className="w-20 lg:w-64 admin-sidebar border-r border-[var(--ff-card-border)] bg-[var(--ff-header-bg)] text-[var(--ff-header-text)] flex flex-col min-h-screen sticky top-0"'
if layout.count(old) != 1:
    raise SystemExit(f"Expected one DashboardLayout sidebar token match, found {layout.count(old)}")
layout_path.write_text(layout.replace(old, new, 1))

print("Removed legacy admin theme lockdown and wired sidebar to header tokens")
