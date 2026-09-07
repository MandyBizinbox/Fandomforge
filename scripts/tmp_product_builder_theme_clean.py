#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "frontend/src/components/product-builder/ProductBuilderV4.jsx"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def main() -> None:
    source = BUILDER.read_text(encoding="utf-8")

    if 'import "./productBuilderV4.css";' not in source:
        source = replace_once(
            source,
            'import ScopedArtworkMockupGenerator from "./ScopedArtworkMockupGenerator";\n',
            'import ScopedArtworkMockupGenerator from "./ScopedArtworkMockupGenerator";\nimport "./productBuilderV4.css";\n',
            "builder stylesheet import",
        )

    replacements = [
        (
            '<div className="text-sm text-zinc-400">Loading product builder…</div>',
            '<div className="text-sm pb4-muted">Loading product builder…</div>',
            "loading copy",
        ),
        (
            '<header className="flex items-start justify-between gap-4 mb-5">',
            '<header className="pb4-header">',
            "builder header",
        ),
        (
            '<p className="text-sm text-zinc-500 mt-2">One clean flow: product → attributes → artwork scopes → mockups → price.</p>',
            '<p className="text-sm pb4-muted mt-2">One clean flow: product → attributes → artwork scopes → mockups → price.</p>',
            "header copy",
        ),
        (
            '<nav className="mb-5 overflow-x-auto" aria-label="Product builder steps"><div className="flex min-w-max gap-2">',
            '<nav className="pb4-step-nav" aria-label="Product builder steps"><div className="pb4-step-nav__inner">',
            "step navigation",
        ),
        (
            'className={`px-3 py-2 rounded-xl border text-[11px] uppercase tracking-widest font-bold transition ${active ? "border-[#FF3B30] bg-[#FF3B30]/15 text-white" : complete ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200" : "border-white/10 bg-white/[0.03] text-zinc-500 hover:text-white"}`}',
            'className={`pb4-step-tab ${active ? "is-active" : complete ? "is-complete" : ""}`}',
            "step button state",
        ),
        (
            '<div className="mb-5 border border-white/10 bg-black/20 rounded-2xl p-4"><div className="text-xs uppercase tracking-widest text-zinc-500">Step {stepIndex + 1} of {STEPS.length}</div><div className="text-2xl font-display uppercase text-white mt-1">{STEPS[stepIndex].title}</div><div className="text-sm text-zinc-400 mt-1">{STEPS[stepIndex].description}</div></div>',
            '<div className="pb4-step-summary"><div className="pb4-step-summary__eyebrow">Step {stepIndex + 1} of {STEPS.length}</div><div className="pb4-step-summary__title">{STEPS[stepIndex].title}</div><div className="pb4-step-summary__copy">{STEPS[stepIndex].description}</div></div>',
            "step summary",
        ),
        (
            '<footer className="mt-6 sticky bottom-0 z-20 border-t border-white/10 bg-black/90 backdrop-blur-xl py-3 flex items-center justify-between gap-3">',
            '<footer className="pb4-footer">',
            "sticky footer",
        ),
        (
            '<p className="text-sm text-zinc-500">Choose the template here. Its production specs are loaded into the editable Specs box below.</p>',
            '<p className="text-sm pb4-muted">Choose the template here. Its production specs are loaded into the editable Specs box below.</p>',
            "basics copy",
        ),
        (
            'className={`text-left rounded-xl border p-4 ${selectedProductTypeId === type.id ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}',
            'className={`pb4-choice-card ${selectedProductTypeId === type.id ? "is-selected" : ""}`}',
            "product type choice",
        ),
        (
            'className={`text-left rounded-xl border p-4 transition ${selected ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}',
            'className={`pb4-choice-card ${selected ? "is-selected" : ""}`}',
            "template choice",
        ),
        (
            '<div className="w-20 h-20 shrink-0 rounded-lg bg-black border border-white/10 overflow-hidden flex items-center justify-center">',
            '<div className="pb4-choice-image">',
            "template image shell",
        ),
        (
            '<div className="text-[10px] uppercase tracking-widest text-emerald-300 mt-2">Selected</div>',
            '<div className="pb4-selected-label">Selected</div>',
            "selected label",
        ),
        (
            '<div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="overline mb-2">Template production summary</div>',
            '<div className="pb4-step-summary"><div className="overline mb-2">Template production summary</div>',
            "template production summary",
        ),
        (
            '<div className="border-t border-white/10 pt-6"><ScopedProductArtworkStudio',
            '<div className="pb4-divider"><ScopedProductArtworkStudio',
            "artwork divider",
        ),
        (
            'className={`relative text-left rounded-xl overflow-hidden border ${selected ? "border-emerald-400" : "border-white/10"}`}',
            'className={`pb4-gallery-card ${selected ? "is-selected" : ""}`}',
            "gallery card",
        ),
        (
            'className="w-full aspect-square object-contain bg-black"',
            'className="pb4-gallery-image"',
            "gallery image",
        ),
        (
            '<div className="p-3 bg-black/60"><div className="text-xs font-bold text-white">',
            '<div className="pb4-gallery-caption"><div className="pb4-gallery-title text-xs font-bold">',
            "gallery caption",
        ),
        (
            '<div className="text-[10px] text-zinc-500 mt-1">{selected ? "Selected for storefront" : "Not selected"}</div>',
            '<div className="pb4-gallery-meta">{selected ? "Selected for storefront" : "Not selected"}</div>',
            "gallery meta",
        ),
        (
            '<span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest bg-emerald-400 text-black px-2 py-1 rounded-full">Selected</span>',
            '<span className="pb4-gallery-badge">Selected</span>',
            "gallery selected badge",
        ),
        (
            '<span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest bg-white text-black px-2 py-1 rounded-full">Primary</span>',
            '<span className="pb4-gallery-primary">Primary</span>',
            "gallery primary badge",
        ),
        (
            'className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/80 text-[9px] uppercase tracking-widest text-white"',
            'className="pb4-gallery-action"',
            "gallery primary action",
        ),
        (
            '<div className="mt-4 border border-dashed border-white/15 rounded-xl p-5 text-sm text-zinc-500">Generate an artwork-scope mockup first.</div>',
            '<div className="pb4-empty-state mt-4">Generate an artwork-scope mockup first.</div>',
            "gallery empty state",
        ),
        (
            '<div className="mt-5 text-xs text-zinc-500">Generated images: {generatedMockups.length}. Storefront images selected: {selectedImages.length}.</div>',
            '<div className="mt-5 text-xs pb4-muted">Generated images: {generatedMockups.length}. Storefront images selected: {selectedImages.length}.</div>',
            "gallery counts",
        ),
        (
            'function Info({ label, value }) { return <div className="border border-white/10 rounded-xl p-3"><div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div><div className="text-sm text-white mt-1 break-words">{value || "—"}</div></div>; }',
            'function Info({ label, value }) { return <div className="pb4-info-card"><div className="pb4-info-label">{label}</div><div className="pb4-info-value">{value || "—"}</div></div>; }',
            "info card helper",
        ),
        (
            'function Metric({ label, value }) { return <div className="border border-white/10 rounded-xl p-4"><div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div><div className="text-xl font-bold text-white mt-1">{value}</div></div>; }',
            'function Metric({ label, value }) { return <div className="pb4-info-card pb4-metric-card"><div className="pb4-info-label">{label}</div><div className="pb4-metric-value">{value}</div></div>; }',
            "metric helper",
        ),
        (
            'function Checklist({ done, label }) { return <div className="flex items-center gap-3 py-2 text-sm"><span className={`w-5 h-5 rounded-full border flex items-center justify-center ${done ? "border-emerald-400 bg-emerald-400 text-black" : "border-white/15 text-zinc-600"}`}>{done && <Check size={12} />}</span><span className={done ? "text-white" : "text-zinc-500"}>{label}</span></div>; }',
            'function Checklist({ done, label }) { return <div className={`pb4-check ${done ? "is-done" : ""}`}><span className="pb4-check__icon">{done && <Check size={12} />}</span><span>{label}</span></div>; }',
            "checklist helper",
        ),
    ]

    for old, new, label in replacements:
        if old in source:
            source = replace_once(source, old, new, label)
        elif new not in source:
            raise RuntimeError(f"{label}: neither source nor target form found")

    # Remaining neutral builder copy should follow theme tokens. These are visual-only class swaps.
    source = source.replace("text-zinc-500", "pb4-muted")
    source = source.replace("text-zinc-400", "pb4-muted")
    source = source.replace("text-zinc-600", "pb4-muted")
    source = source.replace("text-zinc-700", "pb4-muted")
    source = source.replace("border-white/10", "border-[var(--ff-card-border)]")
    source = source.replace("border-white/15", "border-[var(--ff-card-border)]")
    source = source.replace("border-white/20", "border-[var(--ff-card-border)]")
    source = source.replace("hover:border-white/30", "hover:border-[var(--ff-primary)]")
    source = source.replace("bg-black/20", "bg-[var(--ff-surface-bg)]")
    source = source.replace("bg-black/60", "bg-[var(--ff-card-bg)]")
    source = source.replace("bg-black/80", "bg-[var(--ff-card-bg)]")
    source = source.replace("bg-black", "bg-[var(--ff-surface-bg)]")
    source = source.replace("text-white", "text-[var(--ff-card-text)]")

    required = [
        'import "./productBuilderV4.css";',
        'className="pb4-header"',
        'className="pb4-step-nav"',
        'pb4-step-tab',
        'className="pb4-step-summary"',
        'className="pb4-footer"',
        'pb4-choice-card',
        'pb4-gallery-card',
        'pb4-info-card',
        'pb4-check',
        'const validateStep = (key) =>',
        'const buildPayload = () =>',
        'const save = async ({ publish = false } = {}) =>',
        'const publishCreator = async (target) =>',
    ]
    for needle in required:
        if needle not in source:
            raise RuntimeError(f"builder invariant missing after migration: {needle}")

    forbidden = [
        'border-[#FF3B30] bg-[#FF3B30]/15',
        'bg-black/90 backdrop-blur-xl',
    ]
    for needle in forbidden:
        if needle in source:
            raise RuntimeError(f"legacy builder chrome remains: {needle}")

    BUILDER.write_text(source, encoding="utf-8")
    print("product-builder-theme-clean-ok")


if __name__ == "__main__":
    main()
