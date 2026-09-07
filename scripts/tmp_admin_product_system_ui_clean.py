#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

files = {
    "route": ROOT / "frontend/src/routes/AdminProductSystemRoute.jsx",
    "templates": ROOT / "frontend/src/components/template-studio/ProductTemplatesPage.jsx",
    "types": ROOT / "frontend/src/components/template-studio/ProductTypesPage.jsx",
    "products": ROOT / "frontend/src/components/product-system/SellableProductsPage.jsx",
    "categories": ROOT / "frontend/src/pages/admin/CategoriesAdmin.jsx",
    "attributes": ROOT / "frontend/src/pages/admin/AttributesAdmin.jsx",
    "overview": ROOT / "frontend/src/components/admin/dashboard/AdminOverview.jsx",
}


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)


def add_embedded_heading(source, signature_old, signature_new, heading, label):
    source = replace_once(source, signature_old, signature_new, f"{label} signature")
    marker = "  return (\n"
    if marker not in source:
        marker = "  return <"
    heading_old = f'<h1 className="font-display text-5xl uppercase">{heading}</h1>'
    heading_old_mb = f'<h1 className="font-display text-5xl uppercase mb-8">{heading}</h1>'
    if heading_old in source:
        heading_target = heading_old
    elif heading_old_mb in source:
        heading_target = heading_old_mb
    else:
        raise RuntimeError(f"{label}: heading not found")
    dynamic = f'<{{embedded ? "h2" : "h1"}} className={{`font-display uppercase ${{embedded ? "text-3xl" : "text-5xl"}}{ " mb-8" if "mb-8" in heading_target else "" }`}}>{heading}</{{embedded ? "h2" : "h1"}}>'
    # JSX does not support an inline conditional tag name; replace with HeadingTag instead.
    dynamic = f'<HeadingTag className={{`font-display uppercase ${{embedded ? "text-3xl" : "text-5xl"}}{ " mb-8" if "mb-8" in heading_target else "" }`}}>{heading}</HeadingTag>'
    source = replace_once(source, heading_target, dynamic, f"{label} heading")

    # Insert HeadingTag before the component's first return after hooks/functions.
    if "  const HeadingTag = embedded ? \"h2\" : \"h1\";\n" not in source:
        return_index = source.find("  return (\n")
        if return_index < 0:
            return_index = source.find("  return <")
        if return_index < 0:
            raise RuntimeError(f"{label}: return marker missing")
        source = source[:return_index] + '  const HeadingTag = embedded ? "h2" : "h1";\n' + source[return_index:]
    return source


# Route: product system owns the single page H1; children become sections.
source = files["route"].read_text()
for old, new in [
    ("<ProductTemplatesPage />", "<ProductTemplatesPage embedded />"),
    ("<ProductTypesPage />", "<ProductTypesPage embedded />"),
    ("<SellableProductsPage />", "<SellableProductsPage embedded />"),
    ("<CategoriesAdmin />", "<CategoriesAdmin embedded />"),
    ("<AttributesAdmin />", "<AttributesAdmin embedded />"),
]:
    source = replace_once(source, old, new, f"route {old}")
source = replace_once(
    source,
    "Product definitions now use real routes instead of JavaScript-selected workspace tabs. Each tool can be deep-linked, refreshed and maintained independently.",
    "Manage product blueprints, templates, sellable products, categories and attributes from one workspace. Manufacturing rules stay separate so product setup remains easy to scan.",
    "product system intro copy",
)
files["route"].write_text(source)

# Product Templates: embedded heading + grouped controls.
source = files["templates"].read_text()
source = add_embedded_heading(
    source,
    "export default function ProductTemplatesPage() {",
    "export default function ProductTemplatesPage({ embedded = false } = {}) {",
    "Product Templates",
    "templates",
)
source = replace_once(
    source,
    '<div className="flex flex-col sm:flex-row gap-3">\n          <select className="input-base md:w-44"',
    '<div className="flex flex-col gap-3 xl:items-end">\n          <div data-testid="template-filter-controls" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">\n          <select className="input-base xl:w-44"',
    "template toolbar start",
)
source = replace_once(
    source,
    '          </select>\n          <button\n            type="button"\n            onClick={() => exportTemplateCsv(false)}',
    '          </select>\n          </div>\n          <div data-testid="template-action-controls" className="flex flex-wrap gap-2 xl:justify-end">\n          <button\n            type="button"\n            onClick={() => exportTemplateCsv(false)}',
    "template filter/action split",
)
source = replace_once(
    source,
    '          <button type="button" onClick={() => navigate("/admin/product-templates/new")} className="btn-primary">\n            <Plus size={14} /> New Template\n          </button>\n        </div>\n      </div>',
    '          <button type="button" onClick={() => navigate("/admin/product-templates/new")} className="btn-primary">\n            <Plus size={14} /> New Template\n          </button>\n          </div>\n        </div>\n      </div>',
    "template toolbar close",
)
files["templates"].write_text(source)

# Other product-system child headings.
configs = [
    ("types", "export default function ProductTypesPage() {", "export default function ProductTypesPage({ embedded = false } = {}) {", "Product Types"),
    ("products", "export default function SellableProductsPage() {", "export default function SellableProductsPage({ embedded = false } = {}) {", "Products"),
    ("categories", "export default function CategoriesAdmin() {", "export default function CategoriesAdmin({ embedded = false } = {}) {", "Categories"),
    ("attributes", "export default function AttributesAdmin() {", "export default function AttributesAdmin({ embedded = false } = {}) {", "Attributes"),
]
for key, old_sig, new_sig, heading in configs:
    src = files[key].read_text()
    src = add_embedded_heading(src, old_sig, new_sig, heading, key)
    files[key].write_text(src)

# Overview: actual card surfaces instead of border-only cells.
source = files["overview"].read_text()
source = replace_once(
    source,
    'className="p-6 border-r border-b border-[var(--ff-card-border)]"',
    'className="p-5 md:p-6 rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] min-w-0"',
    "overview stat card",
)
source = replace_once(
    source,
    'className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-[var(--ff-card-border)]"',
    'className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"',
    "overview stat grid",
)
files["overview"].write_text(source)

# Guard invariants.
for key in ("templates", "types", "products", "categories", "attributes"):
    src = files[key].read_text()
    if 'embedded = false' not in src or 'embedded ? "h2" : "h1"' not in src:
        raise RuntimeError(f"{key}: embedded heading invariant missing")

if 'data-testid="template-filter-controls"' not in files["templates"].read_text():
    raise RuntimeError("template filter controls invariant missing")
if 'data-testid="template-action-controls"' not in files["templates"].read_text():
    raise RuntimeError("template action controls invariant missing")
if 'bg-[var(--ff-card-bg)]' not in files["overview"].read_text():
    raise RuntimeError("overview surface invariant missing")

print("admin-product-system-ui-clean-ok")
