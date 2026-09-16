import React, { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../lib/api";

const EMPTY_DEFAULTS = {
  creator_default_title: "",
  creator_default_description: "",
  specs: "",
  material_composition: "",
  care_instructions: "",
  fit_notes: "",
};

function textareaRows(value, minimum = 3) {
  const lines = String(value || "").split(/\r?\n/).length;
  return Math.max(minimum, Math.min(8, lines + 1));
}

export default function ProductTemplateStorefrontDefaultsModal({ templateId, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [form, setForm] = useState(EMPTY_DEFAULTS);

  useEffect(() => {
    let mounted = true;
    if (!open || !templateId) return undefined;

    async function load() {
      setLoading(true);
      try {
        const response = await http.get(`/admin/product-templates/${templateId}`);
        if (!mounted) return;
        const template = response.data || {};
        setTemplateName(template.name || "Product template");
        setForm({
          creator_default_title: template.creator_default_title || "",
          creator_default_description:
            template.creator_default_description
            || template.storefront_description
            || template.marketing_description
            || template.short_description
            || "",
          specs:
            template.specs
            || template.specifications
            || template.product_specs
            || template.features
            || template.specification_text
            || "",
          material_composition: template.material_composition || template.materials || "",
          care_instructions: template.care_instructions || template.care || "",
          fit_notes: template.fit_notes || template.sizing_notes || template.fit_and_sizing || "",
        });
      } catch (error) {
        toast.error(error.response?.data?.detail || "Could not load storefront defaults");
        onClose?.();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [open, onClose, templateId]);

  if (!open) return null;

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!templateId || saving) return;
    setSaving(true);
    try {
      await http.patch(`/admin/product-templates/${templateId}`, {
        creator_default_title: form.creator_default_title.trim(),
        creator_default_description: form.creator_default_description,
        specs: form.specs,
        material_composition: form.material_composition,
        care_instructions: form.care_instructions,
        fit_notes: form.fit_notes,
      });
      toast.success("Storefront defaults saved");
      onClose?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save storefront defaults");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Storefront defaults">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-white/15 bg-[#0b0b0b] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b0b0b] px-5 py-4">
          <div>
            <div className="overline mb-1">Product template</div>
            <h2 className="font-display text-2xl uppercase">Storefront defaults</h2>
            <p className="mt-1 max-w-2xl text-xs text-zinc-400">
              These values are copied into each new creator product made from {templateName || "this template"}. Existing creator products are never overwritten.
            </p>
          </div>
          <button type="button" className="btn-secondary px-3" onClick={onClose} aria-label="Close storefront defaults"><X size={16} /></button>
        </header>

        {loading ? (
          <div className="p-8 text-sm text-zinc-400">Loading storefront defaults…</div>
        ) : (
          <div className="grid gap-5 p-5">
            <section className="grid gap-4 border border-white/10 bg-black/30 p-4">
              <div>
                <div className="overline">Public product copy</div>
                <p className="mt-1 text-xs text-zinc-500">Creator products start with this copy and may customise their title, description and specification text.</p>
              </div>

              <label>
                <span className="label">Default creator product title</span>
                <input className="input-base" value={form.creator_default_title} onChange={(event) => update("creator_default_title", event.target.value)} placeholder="Leave blank to use the template name" />
              </label>

              <label>
                <span className="label">Storefront description</span>
                <textarea className="input-base" rows={textareaRows(form.creator_default_description, 4)} value={form.creator_default_description} onChange={(event) => update("creator_default_description", event.target.value)} placeholder="Customer-facing product description. Keep supplier/internal notes out of this field." />
              </label>

              <label>
                <span className="label">Specifications & features</span>
                <textarea className="input-base" rows={textareaRows(form.specs, 4)} value={form.specs} onChange={(event) => update("specs", event.target.value)} placeholder={"165gsm cotton\nRegular crew neck\nSide-seamed construction"} />
              </label>
            </section>

            <section className="grid gap-4 border border-white/10 bg-black/30 p-4">
              <div>
                <div className="overline">Product information</div>
                <p className="mt-1 text-xs text-zinc-500">These fields are appended as structured headings inside the public Specifications & Features block.</p>
              </div>

              <label>
                <span className="label">Material / composition</span>
                <textarea className="input-base" rows={textareaRows(form.material_composition)} value={form.material_composition} onChange={(event) => update("material_composition", event.target.value)} placeholder="100% combed cotton" />
              </label>

              <label>
                <span className="label">Care instructions</span>
                <textarea className="input-base" rows={textareaRows(form.care_instructions)} value={form.care_instructions} onChange={(event) => update("care_instructions", event.target.value)} placeholder={"Machine wash cold\nDo not bleach\nDo not iron directly on print"} />
              </label>

              <label>
                <span className="label">Fit / sizing notes</span>
                <textarea className="input-base" rows={textareaRows(form.fit_notes)} value={form.fit_notes} onChange={(event) => update("fit_notes", event.target.value)} placeholder="Regular unisex fit. Use the size guide for garment measurements." />
              </label>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <p className="text-xs text-zinc-500">Supplier name, supplier URL, supplier notes and internal costs remain admin-only operational data.</p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                <button type="button" className="btn-primary" disabled={saving} onClick={save}><Save size={15} /> {saving ? "Saving…" : "Save storefront defaults"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
