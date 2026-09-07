#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "frontend/src/components/product-builder/ProductBuilderV4.jsx"
CSS = ROOT / "frontend/src/components/product-builder/productBuilderV4.css"

START = "function BasicsStep({ form, update, productTypes, selectedProductTypeId, chooseType, templates, selectedTemplate, chooseTemplate, creators, isAdmin, product }) {"
END = "function VariationsStep({ template, selectedIds, onChange, hasVariations })"

NEW_BASICS = r'''function BasicsStep({ form, update, productTypes, selectedProductTypeId, chooseType, templates, selectedTemplate, chooseTemplate, creators, isAdmin, product }) {
  const selectedType = productTypes.find((type) => String(type.id) === String(selectedProductTypeId)) || null;
  return <div className="space-y-6"><section className="card space-y-5">
    <div><div className="overline mb-1">Product basics</div><p className="text-sm pb4-muted">Start with a product type. Matching templates appear next, and full template information only opens after you choose one.</p></div>
    {isAdmin && <Field label="Creator"><select className="input-base" value={form.band_id} onChange={(e) => update("band_id", e.target.value)} disabled={Boolean(product?.band_id)}><option value="">Select creator</option>{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></Field>}

    <section className="pb4-selection-stage" aria-labelledby="pb4-select-type-title">
      <div className="pb4-selection-stage__header"><div><div className="pb4-selection-stage__step">1</div><div><div id="pb4-select-type-title" className="overline">Select type</div><div className="pb4-selection-stage__title">What are you making?</div></div></div>{selectedType && <div className="pb4-selection-stage__status">{selectedType.name}</div>}</div>
      <div className="pb4-type-grid">{productTypes.map((type) => { const selected = String(selectedProductTypeId) === String(type.id); return <button key={type.id} type="button" aria-pressed={selected} onClick={() => chooseType(type.id)} className={`pb4-type-card ${selected ? "is-selected" : ""}`}><span>{type.name}</span>{selected && <Check size={13} />}</button>; })}</div>
    </section>

    {selectedProductTypeId ? <section className="pb4-selection-stage is-open" aria-labelledby="pb4-select-template-title">
      <div className="pb4-selection-stage__header"><div><div className="pb4-selection-stage__step">2</div><div><div id="pb4-select-template-title" className="overline">Choose template</div><div className="pb4-selection-stage__title">{selectedType?.name || "Matching products"}</div></div></div><div className="pb4-selection-stage__status">{templates.length} option{templates.length === 1 ? "" : "s"}</div></div>
      {templates.length ? <div className="pb4-template-browser">
        <div className="pb4-template-grid">{templates.map((template) => { const selected = selectedTemplate?.id === template.id; const image = getTemplateImage(template); return <button key={template.id} type="button" aria-pressed={selected} onClick={() => chooseTemplate(template)} className={`pb4-template-card ${selected ? "is-selected" : ""}`}><div className="pb4-template-card__image">{image ? <img src={assetUrl(image)} alt={template.name} /> : <Package size={24} className="pb4-muted" />}</div><div className="pb4-template-card__body"><div className="pb4-template-card__title">{template.name}</div><div className="pb4-template-card__meta"><span>{money(getCreatorBlankPrice(template))}</span><span>{asArray(template.print_areas).length} print area{asArray(template.print_areas).length === 1 ? "" : "s"}</span></div>{selected && <div className="pb4-selected-label">Selected</div>}</div></button>; })}</div>
        {selectedTemplate ? <aside className="pb4-template-detail" aria-live="polite"><div className="pb4-template-detail__hero">{getTemplateImage(selectedTemplate) ? <img src={assetUrl(getTemplateImage(selectedTemplate))} alt={selectedTemplate.name} /> : <Package size={42} className="pb4-muted" />}</div><div className="pb4-template-detail__content"><div className="overline mb-1">Selected template</div><h3 className="pb4-template-detail__title">{selectedTemplate.name}</h3><p className="pb4-template-detail__description">{getTemplateShortDescription(selectedTemplate)}</p><div className="pb4-template-detail__stats"><Info label="Base" value={money(getCreatorBlankPrice(selectedTemplate))} /><Info label="Print areas" value={String(asArray(selectedTemplate.print_areas).length)} /><Info label="Options" value={getTemplateAvailableOptionsSummary(selectedTemplate).join(" · ") || "Configured"} /><Info label="Production" value={String(asArray(selectedTemplate.production_methods || selectedTemplate.print_options).length || "Configured")} /></div></div></aside> : <div className="pb4-template-detail pb4-template-detail--empty"><Package size={28} /><div><div className="font-bold">Choose a template</div><div className="text-sm pb4-muted mt-1">Select one of the compact cards to open its product information here.</div></div></div>}
      </div> : <div className="pb4-empty-state">No active templates are available for this product type.</div>}
    </section> : <div className="pb4-empty-state">Select a product type above to open its available templates.</div>}

    {selectedTemplate && <section className="pb4-selection-stage is-open" aria-labelledby="pb4-product-info-title">
      <div className="pb4-selection-stage__header"><div><div className="pb4-selection-stage__step">3</div><div><div id="pb4-product-info-title" className="overline">Product information</div><div className="pb4-selection-stage__title">Make it sellable</div></div></div></div>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Product name"><input className="input-base" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Creator logo hoodie" /></Field><Field label="Slug"><input className="input-base" value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="creator-logo-hoodie" /></Field></div>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Category"><input className="input-base" value={form.category} onChange={(e) => update("category", e.target.value)} /></Field><Field label="Brand"><input className="input-base" value={form.brand} onChange={(e) => update("brand", e.target.value)} placeholder="FandomForge" /></Field></div>
      <Field label="Description"><textarea className="input-base" rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
      <Field label="Specs / features — editable"><textarea className="input-base" rows={8} value={form.specs} onChange={(e) => update("specs", e.target.value)} placeholder="Template specs will appear here…" /></Field>
      <label className="flex items-center gap-3 text-sm text-[var(--ff-card-text)]"><input type="checkbox" checked={form.active !== false} onChange={(e) => update("active", e.target.checked)} /> Active product</label>
    </section>}
  </section></div>;
}
'''

CSS_BLOCK = r'''

/* Progressive Basics selection */
.pb4-selection-stage {
  display: grid;
  gap: 1rem;
  padding-top: 0.25rem;
}

.pb4-selection-stage + .pb4-selection-stage,
.pb4-selection-stage + .pb4-empty-state,
.pb4-empty-state + .pb4-selection-stage {
  margin-top: 0.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--ff-card-border);
}

.pb4-selection-stage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.pb4-selection-stage__header > div:first-child {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
}

.pb4-selection-stage__step {
  display: inline-flex;
  width: 1.8rem;
  height: 1.8rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ff-primary);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ff-primary) 10%, var(--ff-card-bg));
  color: var(--ff-card-text);
  font-size: 0.72rem;
  font-weight: 800;
}

.pb4-selection-stage__title {
  margin-top: 0.15rem;
  color: var(--ff-card-text);
  font-family: var(--ff-font-display, inherit);
  font-size: 1.25rem;
  line-height: 1.05;
  text-transform: uppercase;
}

.pb4-selection-stage__status {
  flex: 0 0 auto;
  color: var(--ff-muted-text);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pb4-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.55rem;
}

.pb4-type-card {
  display: flex;
  min-height: 2.8rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--ff-card-border);
  border-radius: calc(var(--ff-card-radius, 0.75rem) * 0.8);
  background: var(--ff-card-bg);
  color: var(--ff-card-text);
  text-align: left;
  font-size: 0.8rem;
  font-weight: 700;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}

.pb4-type-card:hover {
  border-color: var(--ff-primary);
  transform: translateY(-1px);
}

.pb4-type-card.is-selected {
  border-color: var(--ff-primary);
  background: color-mix(in srgb, var(--ff-primary) 9%, var(--ff-card-bg));
}

.pb4-template-browser {
  display: grid;
  gap: 1rem;
}

.pb4-template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  align-content: start;
  gap: 0.7rem;
}

.pb4-template-card {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: 0.7rem;
  min-height: 5.2rem;
  padding: 0.65rem;
  border: 1px solid var(--ff-card-border);
  border-radius: var(--ff-card-radius, 0.75rem);
  background: var(--ff-card-bg);
  color: var(--ff-card-text);
  text-align: left;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}

.pb4-template-card:hover {
  border-color: var(--ff-primary);
  transform: translateY(-1px);
}

.pb4-template-card.is-selected {
  border-color: var(--ff-primary);
  background: color-mix(in srgb, var(--ff-primary) 9%, var(--ff-card-bg));
}

.pb4-template-card__image {
  display: flex;
  width: 4rem;
  height: 4rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--ff-card-border);
  border-radius: calc(var(--ff-card-radius, 0.75rem) * 0.75);
  background: var(--ff-surface-bg);
}

.pb4-template-card__image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pb4-template-card__body {
  min-width: 0;
}

.pb4-template-card__title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ff-card-text);
  font-family: var(--ff-font-display, inherit);
  font-size: 1rem;
  line-height: 1.05;
  text-transform: uppercase;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.pb4-template-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.7rem;
  margin-top: 0.45rem;
  color: var(--ff-muted-text);
  font-size: 0.64rem;
  font-weight: 700;
  text-transform: uppercase;
}

.pb4-template-detail {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
  padding: 0.9rem;
  border: 1px solid var(--ff-card-border);
  border-radius: var(--ff-card-radius, 0.75rem);
  background: var(--ff-surface-bg);
  color: var(--ff-surface-text);
}

.pb4-template-detail__hero {
  display: flex;
  min-height: 10rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--ff-card-border);
  border-radius: calc(var(--ff-card-radius, 0.75rem) * 0.8);
  background: var(--ff-card-bg);
}

.pb4-template-detail__hero img {
  width: 100%;
  height: 11rem;
  object-fit: contain;
}

.pb4-template-detail__title {
  margin: 0;
  color: var(--ff-surface-text);
  font-family: var(--ff-font-display, inherit);
  font-size: 1.55rem;
  line-height: 1;
  text-transform: uppercase;
}

.pb4-template-detail__description {
  margin-top: 0.55rem;
  color: var(--ff-muted-text);
  font-size: 0.78rem;
  line-height: 1.5;
}

.pb4-template-detail__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.pb4-template-detail--empty {
  min-height: 12rem;
  place-content: center;
  text-align: center;
  color: var(--ff-muted-text);
}

@media (min-width: 1024px) {
  .pb4-template-browser {
    grid-template-columns: minmax(0, 1.45fr) minmax(18rem, 0.75fr);
    align-items: start;
  }

  .pb4-template-detail {
    position: sticky;
    top: 1rem;
  }
}
'''


def main():
    source = BUILDER.read_text(encoding="utf-8")
    start = source.find(START)
    end = source.find(END)
    if start < 0 or end < 0 or end <= start:
        raise RuntimeError("Could not locate BasicsStep block")
    if "pb4-type-grid" not in source:
        source = source[:start] + NEW_BASICS + source[end:]
    BUILDER.write_text(source, encoding="utf-8")

    css = CSS.read_text(encoding="utf-8")
    if "/* Progressive Basics selection */" not in css:
        css = css.rstrip() + CSS_BLOCK + "\n"
    CSS.write_text(css, encoding="utf-8")

    checks = [
        "pb4-type-grid",
        "pb4-template-browser",
        "pb4-template-card",
        "pb4-template-detail",
        "Select a product type above to open its available templates.",
        "const validateStep = (key) =>",
        "const buildPayload = () =>",
        "const save = async ({ publish = false } = {}) =>",
    ]
    transformed = BUILDER.read_text(encoding="utf-8")
    for needle in checks:
        if needle not in transformed:
            raise RuntimeError(f"missing invariant: {needle}")
    if 'getTemplateShortDescription(template)' in transformed[transformed.find(START):transformed.find(END)]:
        raise RuntimeError("Template list still renders descriptions in compact cards")
    print("product-builder-progressive-selection-ok")


if __name__ == "__main__":
    main()
