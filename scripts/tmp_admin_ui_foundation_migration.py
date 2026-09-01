from pathlib import Path

root = Path(__file__).resolve().parents[1]

css_path = root / "frontend/src/styles/platform-foundation.css"
unified_path = root / "frontend/src/pages/admin/AdminManufacturingRulesUnified.jsx"
shared_path = root / "frontend/src/pages/admin/manufacturingRulesShared.jsx"
panel_path = root / "frontend/src/pages/admin/ManufacturingProfilesPanel.jsx"


def replace_exact(path, old, new, count=None):
    text = path.read_text()
    actual = text.count(old)
    expected = 1 if count is None else count
    if actual != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences of {old!r}, found {actual}")
    path.write_text(text.replace(old, new))

css = css_path.read_text()
marker = "/* Canonical admin UI primitives */"
if marker in css:
    raise SystemExit("admin UI foundation already present")
css += r'''

/* Canonical admin UI primitives */
.ff-admin-page {
  min-height: 100%;
  padding: 2rem 0;
  background: var(--ff-page-bg);
  color: var(--ff-page-text);
}

.ff-admin-page__inner {
  width: min(100% - 2rem, 80rem);
  margin-inline: auto;
  display: grid;
  gap: 1.5rem;
}

.ff-admin-page-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.ff-admin-page-title {
  margin: 0;
  color: var(--ff-page-text);
  font-family: var(--ff-font-display, inherit);
  font-size: clamp(2rem, 5vw, 3.25rem);
  line-height: 0.95;
  text-transform: uppercase;
}

.ff-admin-page-description,
.ff-admin-muted {
  color: var(--ff-muted-text);
}

.ff-admin-page-description {
  max-width: 48rem;
  margin-top: 0.5rem;
}

.ff-admin-card,
.ff-admin-stat-card,
.ff-admin-subpanel {
  background: var(--ff-card-bg);
  color: var(--ff-card-text);
  border: 1px solid var(--ff-card-border);
  border-radius: var(--ff-card-radius, 0.5rem);
  box-shadow: var(--ff-card-shadow, none);
}

.ff-admin-card {
  padding: 1.25rem;
}

.ff-admin-subpanel {
  padding: 1rem;
  background: var(--ff-surface-bg);
  color: var(--ff-surface-text);
}

.ff-admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
}

.ff-admin-stat-card {
  padding: 1rem 1.125rem;
}

.ff-admin-field {
  display: grid;
  gap: 0.4rem;
}

.ff-admin-label {
  color: var(--ff-muted-text);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ff-admin-section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--ff-card-border);
}

.ff-admin-section-link,
.ff-admin-method-link {
  border: 1px solid var(--ff-card-border);
  background: var(--ff-card-bg);
  color: var(--ff-card-text);
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}

.ff-admin-section-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.55rem 0.9rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-decoration: none;
  text-transform: uppercase;
}

.ff-admin-section-link:hover,
.ff-admin-section-link.is-active,
.ff-admin-method-link:hover,
.ff-admin-method-link.is-active {
  border-color: var(--ff-primary);
  background: color-mix(in srgb, var(--ff-primary) 12%, var(--ff-card-bg));
  color: var(--ff-card-text);
}

.ff-admin-section-link.is-active {
  box-shadow: inset 0 -2px 0 var(--ff-primary);
}

.ff-admin-danger-text {
  color: var(--ff-danger, #dc2626);
}

.ff-admin-success-border {
  border-color: var(--ff-success, #16a34a);
}

.ff-admin-danger-border {
  border-color: var(--ff-danger, #dc2626);
}

@media (min-width: 768px) {
  .ff-admin-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .ff-admin-page-header {
    flex-direction: row;
  }

  .ff-admin-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
'''
css_path.write_text(css)

replace_exact(unified_path,
    'return <div className="page-shell min-h-screen py-8"><div className="max-w-7xl mx-auto px-4 space-y-6">',
    'return <div className="ff-admin-page"><div className="ff-admin-page__inner">')
replace_exact(unified_path,
    '<div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4"><div><p className="overline mb-2">Admin / Production</p><h1 className="font-display text-5xl uppercase">Manufacturing Rules</h1><p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">',
    '<div className="ff-admin-page-header"><div><p className="overline mb-2">Admin / Production</p><h1 className="ff-admin-page-title">Manufacturing Rules</h1><p className="ff-admin-page-description">')
replace_exact(unified_path,
    '<div className="grid md:grid-cols-4 gap-4"><Stat',
    '<div className="ff-admin-stat-grid"><Stat')
replace_exact(unified_path,
    '<nav className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-3" aria-label="Manufacturing rules sections">{[["methods", "Print Methods"], ["colours", "Stocked Colours"], ["settings", "Global Settings"]].map(([key, label]) => <NavLink key={key} to={`/admin/manufacturing-rules/${key}`} className={activeSection === key ? "btn-primary" : "btn-secondary"}>{label}</NavLink>)}</nav>',
    '<nav className="ff-admin-section-nav" aria-label="Manufacturing rules sections">{[["methods", "Print Methods"], ["colours", "Stocked Colours"], ["settings", "Global Settings"]].map(([key, label]) => <NavLink key={key} to={`/admin/manufacturing-rules/${key}`} className={`ff-admin-section-link ${activeSection === key ? "is-active" : ""}`}>{label}</NavLink>)}</nav>')
replace_exact(unified_path, 'className="card space-y-4"', 'className="ff-admin-card space-y-4"', count=2)
replace_exact(unified_path, 'className={`card space-y-4 ${draft.active === false ? "opacity-60" : ""}`}', 'className={`ff-admin-card space-y-4 ${draft.active === false ? "opacity-60" : ""}`}')
replace_exact(unified_path, 'className="text-sm text-[var(--ff-muted-text)]"', 'className="text-sm ff-admin-muted"', count=1)
replace_exact(unified_path, 'className="text-sm text-[var(--ff-muted-text)] mt-2"', 'className="text-sm ff-admin-muted mt-2"', count=1)

replace_exact(shared_path, 'return <div className="card"><div className="flex items-center justify-between gap-3">', 'return <div className="ff-admin-stat-card"><div className="flex items-center justify-between gap-3">')
replace_exact(shared_path, 'return <label className="block"><span className="label">{label}</span>', 'return <label className="ff-admin-field"><span className="ff-admin-label">{label}</span>')
replace_exact(shared_path, 'className="flex items-center gap-3 text-sm text-[var(--ff-muted-text)]"', 'className="flex items-center gap-3 text-sm ff-admin-muted"')
replace_exact(shared_path, 'return <div className={`card border ${complete ? "border-green-500/50" : "border-[var(--ff-primary)]"}`}>', 'return <div className={`ff-admin-card ${complete ? "ff-admin-success-border" : "border-[var(--ff-primary)]"}`}>')
replace_exact(shared_path, 'className={`border p-3 ${label === "Blockers" && value ? "border-red-500" : "border-[var(--ff-card-border)]"}`}', 'className={`ff-admin-subpanel ${label === "Blockers" && value ? "ff-admin-danger-border" : ""}`}')
replace_exact(shared_path, 'className="block text-red-400 mt-1"', 'className="block ff-admin-danger-text mt-1"')

replace_exact(panel_path, 'return <div className="border border-[var(--ff-card-border)] p-4 space-y-3">', 'return <div className="ff-admin-subpanel space-y-3">')
replace_exact(panel_path, 'className="sm:col-span-2 xl:col-span-4 text-xs text-red-400"', 'className="sm:col-span-2 xl:col-span-4 text-xs ff-admin-danger-text"')
replace_exact(panel_path, 'className="text-xs text-red-400"', 'className="text-xs ff-admin-danger-text"')
replace_exact(panel_path, 'return <div className={`border p-4 space-y-4 ${profile.is_default ? "border-[var(--ff-primary)]" : "border-[var(--ff-card-border)]"} ${profile.status === "archived" ? "opacity-60" : ""}`}>', 'return <div className={`ff-admin-subpanel space-y-4 ${profile.is_default ? "border-[var(--ff-primary)]" : ""} ${profile.status === "archived" ? "opacity-60" : ""}`}>')
replace_exact(panel_path, 'return <div className="card">', 'return <div className="ff-admin-card">')
replace_exact(panel_path, '<div className="card space-y-2"><p className="overline mb-3">Production methods</p>', '<div className="ff-admin-card space-y-2"><p className="overline mb-3">Production methods</p>')
replace_exact(panel_path,
    'className={`w-full border p-3 text-left ${selected?.method_key === method.method_key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-white" : "border-[var(--ff-card-border)]"}`}',
    'className={`ff-admin-method-link w-full p-3 text-left ${selected?.method_key === method.method_key ? "is-active" : ""}`}')
replace_exact(panel_path, '<div className="card"><div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">', '<div className="ff-admin-card"><div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">')
replace_exact(panel_path, '<div className="card space-y-4"><div className="flex items-center justify-between">', '<div className="ff-admin-card space-y-4"><div className="flex items-center justify-between">')

print("Manufacturing Rules migrated to ff-admin UI foundation")
