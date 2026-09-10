import React, { useEffect, useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";

const PRINT_SIZE_PRESETS = [
  { key: "sleeve_large_20x30_cm", label: "Sleeve Large", print_size: "Sleeve Large 20×30cm", width_mm: 200, height_mm: 300, dpi: 300, fit_mode: "contain", positions: ["sleeve"] },
  { key: "sleeve_long_10x30_cm", label: "Sleeve Long", print_size: "Sleeve Long 10×30cm", width_mm: 100, height_mm: 300, dpi: 300, fit_mode: "contain", positions: ["sleeve"] },
  { key: "small_square_5x5_cm", label: "Small Square", print_size: "Small Square 5×5cm", width_mm: 50, height_mm: 50, dpi: 300, fit_mode: "contain", positions: ["front", "back", "sleeve", "pocket"] },
  { key: "neck_label_wide_9x2_cm", label: "Neck Label Wide", print_size: "Neck Label Wide 9×2cm", width_mm: 90, height_mm: 20, dpi: 300, fit_mode: "contain", positions: ["neck_label"] },
  { key: "a4_portrait", label: "A4 Portrait", print_size: "A4 Portrait 21×29.7cm", width_mm: 210, height_mm: 297, dpi: 300, fit_mode: "contain", positions: ["front", "back", "sleeve"] },
  { key: "a3_portrait", label: "A3 Portrait", print_size: "A3 Portrait 29.7×42cm", width_mm: 297, height_mm: 420, dpi: 300, fit_mode: "contain", positions: ["front", "back", "sleeve"] },
];

const PRINT_PLACEMENT_TAGS = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "sleeve", label: "Sleeve" },
  { key: "neck_label", label: "Neck Label" },
  { key: "pocket", label: "Pocket" },
];

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyForm() {
  return {
    rule_name: "",
    method_key: "",
    calculation_type: "fixed",
    print_size: "",
    standard_print_size_key: "",
    width_mm: 0,
    height_mm: 0,
    dpi: 300,
    fit_mode: "contain",
    print_cost_max: 0,
    sheet_width_mm: 500,
    sheet_height_mm: 1000,
    sheet_cost: 300,
    cost_per_cm2: 0.06,
    minimum_print_cost: 0,
    waste_percentage: 0,
    markup_percentage: 0,
    print_positions: "",
    pricing_notes: "",
    production_notes: "",
    status: "active",
  };
}

function printOptionOutputLabel(option) {
  const parts = [];
  if (option.standard_print_size_key) parts.push(option.standard_print_size_key);
  if (option.width_mm && option.height_mm) parts.push(`${option.width_mm}×${option.height_mm}mm`);
  if (option.dpi) parts.push(`${option.dpi}DPI`);
  if (option.fit_mode) parts.push(`${option.fit_mode} fit`);
  return parts.length ? parts.join(" · ") : "No production metadata";
}

function pricingSummary(row) {
  const type = row.calculation_type || "fixed";
  if (type === "fixed") return `Fixed · ${money(row.print_cost_max || 0)}`;
  if (type === "area_from_sheet") return `Sheet ${row.sheet_width_mm || 0}×${row.sheet_height_mm || 0}mm · R ${Number(row.cost_per_cm2 || 0).toFixed(4)}/cm² · min ${money(row.minimum_print_cost || 0)}`;
  if (type === "area_fixed_rate") return `R ${Number(row.cost_per_cm2 || 0).toFixed(4)}/cm² · min ${money(row.minimum_print_cost || 0)}`;
  if (type === "sheet") return `Full sheet · ${money(row.sheet_cost || 0)}`;
  return type;
}

function resolvePrintSize(draft) {
  if (draft.print_size) return draft.print_size;
  if (draft.calculation_type === "area_from_sheet") return "Dynamic area from sheet";
  if (draft.calculation_type === "area_fixed_rate") return "Dynamic area cm²";
  if (draft.calculation_type === "sheet") return "Full sheet";
  return "Fixed price";
}

function resolveStandardKey(draft) {
  if (draft.standard_print_size_key) return draft.standard_print_size_key;
  if (draft.calculation_type === "area_from_sheet") return "dynamic_area_from_sheet";
  if (draft.calculation_type === "area_fixed_rate") return "dynamic_area_cm2";
  if (draft.calculation_type === "sheet") return "full_sheet";
  return "fixed_price";
}

export default function PrintOptionsPage() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [loadingRows, setLoadingRows] = useState(false);

  const selectedPlacements = useMemo(() => splitCsv(form.print_positions), [form.print_positions]);

  const load = async () => {
    setLoadingRows(true);
    try {
      const response = await http.get("/print-options?status=all");
      setRows(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load pricing rules");
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cancelForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setMode("list");
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setMode("create");
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      rule_name: row.rule_name || row.print_method || "",
      method_key: row.method_key || "",
      calculation_type: row.calculation_type || "fixed",
      print_size: row.print_size || "",
      standard_print_size_key: row.standard_print_size_key || "",
      width_mm: row.width_mm || 0,
      height_mm: row.height_mm || 0,
      dpi: row.dpi || 300,
      fit_mode: row.fit_mode || "contain",
      print_cost_max: row.print_cost_max || 0,
      sheet_width_mm: row.sheet_width_mm || 0,
      sheet_height_mm: row.sheet_height_mm || 0,
      sheet_cost: row.sheet_cost || 0,
      cost_per_cm2: row.cost_per_cm2 || 0,
      minimum_print_cost: row.minimum_print_cost || 0,
      waste_percentage: row.waste_percentage || 0,
      markup_percentage: row.markup_percentage || 0,
      print_positions: (row.print_positions || []).join(", "),
      pricing_notes: row.pricing_notes || "",
      production_notes: row.production_notes || "",
      status: row.status || "active",
    });
    setMode("edit");
  };

  const applySizePreset = (sizeKey) => {
    const preset = PRINT_SIZE_PRESETS.find((item) => item.key === sizeKey);
    if (!preset) {
      setForm((current) => ({ ...current, standard_print_size_key: "", print_size: "", width_mm: 0, height_mm: 0 }));
      return;
    }
    setForm((current) => ({
      ...current,
      standard_print_size_key: preset.key,
      print_size: preset.print_size,
      width_mm: preset.width_mm,
      height_mm: preset.height_mm,
      dpi: preset.dpi,
      fit_mode: preset.fit_mode,
      print_positions: preset.positions.join(", "),
    }));
  };

  const recalcCostPerCm2 = (patch = {}) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      const areaCm2 = (Number(next.sheet_width_mm || 0) / 10) * (Number(next.sheet_height_mm || 0) / 10);
      if (areaCm2 > 0 && Number(next.sheet_cost || 0) > 0) {
        next.cost_per_cm2 = (Number(next.sheet_cost || 0) / areaCm2).toFixed(6);
      }
      return next;
    });
  };

  const togglePlacement = (key) => {
    const next = selectedPlacements.includes(key)
      ? selectedPlacements.filter((item) => item !== key)
      : [...selectedPlacements, key];
    setForm((current) => ({ ...current, print_positions: next.join(", ") }));
  };

  const makePayload = () => {
    const ruleName = String(form.rule_name || "").trim();
    return {
      rule_name: ruleName,
      print_method: ruleName,
      method_key: String(form.method_key || "").trim(),
      calculation_type: form.calculation_type || "fixed",
      print_size: resolvePrintSize(form),
      standard_print_size_key: resolveStandardKey(form),
      width_mm: Number(form.width_mm || 0),
      height_mm: Number(form.height_mm || 0),
      dpi: Number(form.dpi || 300),
      fit_mode: form.fit_mode || "contain",
      print_cost_max: Number(form.print_cost_max || 0),
      sheet_width_mm: Number(form.sheet_width_mm || 0),
      sheet_height_mm: Number(form.sheet_height_mm || 0),
      sheet_cost: Number(form.sheet_cost || 0),
      cost_per_cm2: Number(form.cost_per_cm2 || 0),
      minimum_print_cost: Number(form.minimum_print_cost || 0),
      waste_percentage: Number(form.waste_percentage || 0),
      markup_percentage: Number(form.markup_percentage || 0),
      print_positions: splitCsv(form.print_positions),
      pricing_notes: form.pricing_notes || "",
      production_notes: form.production_notes || "",
      status: form.status || "active",
    };
  };

  const save = async (event) => {
    event.preventDefault();
    if (!String(form.rule_name || "").trim()) {
      toast.error("Rule name is required");
      return;
    }
    try {
      if (editingId) {
        await http.patch(`/print-options/${editingId}`, makePayload());
        toast.success("Pricing rule updated");
      } else {
        await http.post("/print-options", makePayload());
        toast.success("Pricing rule created");
      }
      await load();
      cancelForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save pricing rule");
    }
  };

  const remove = async (row) => {
    const label = row.rule_name || row.print_method || "this pricing rule";
    if (!window.confirm(`Delete/archive ${label}?`)) return;
    try {
      await http.delete(`/print-options/${row.id}`);
      toast.success("Removed");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed");
    }
  };

  if (mode !== "list") {
    return (
      <form onSubmit={save} className="card space-y-6 max-w-5xl" data-testid="admin-print-option-form">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="overline mb-2">{editingId ? "Edit Pricing Rule" : "Create Pricing Rule"}</div>
            <h1 className="font-display text-4xl uppercase">{editingId ? form.rule_name || "Pricing Rule" : "New Pricing Rule"}</h1>
          </div>
          <button type="button" onClick={cancelForm} className="btn-secondary">Back to list</button>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <label><span className="label">Rule Name / Print Method Title</span><input className="input-base" required placeholder="Example: DTF - Area From Sheet" value={form.rule_name} onChange={(e) => setForm({ ...form, rule_name: e.target.value })} /></label>
          <label><span className="label">Method Key / Category</span><input className="input-base" placeholder="Example: dtf, embroidery, dtf_area_sheet" value={form.method_key} onChange={(e) => setForm({ ...form, method_key: e.target.value })} /></label>
          <label className="lg:col-span-2"><span className="label">Calculation Type</span><select className="input-base" value={form.calculation_type} onChange={(e) => setForm({ ...form, calculation_type: e.target.value })}><option value="fixed">Fixed</option><option value="area_from_sheet">Area from sheet</option><option value="area_fixed_rate">Area fixed rate per cm²</option><option value="sheet">Full sheet</option></select></label>
        </div>

        {form.calculation_type === "fixed" && (
          <section className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-5 space-y-4">
            <div><div className="overline mb-1">Fixed Output</div><p className="text-xs text-[var(--ff-muted-text)]">Use this when the rule has a fixed output size or fixed print cost.</p></div>
            <label><span className="label">Size preset</span><select className="input-base" value={form.standard_print_size_key} onChange={(e) => applySizePreset(e.target.value)}><option value="">No size preset / custom</option>{PRINT_SIZE_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label} · {preset.print_size}</option>)}</select></label>
            <label><span className="label">Print size label</span><input className="input-base" value={form.print_size} onChange={(e) => setForm({ ...form, print_size: e.target.value })} /></label>
            <div className="grid md:grid-cols-2 gap-3"><label><span className="label">Width mm</span><input className="input-base" type="number" value={form.width_mm} onChange={(e) => setForm({ ...form, width_mm: e.target.value })} /></label><label><span className="label">Height mm</span><input className="input-base" type="number" value={form.height_mm} onChange={(e) => setForm({ ...form, height_mm: e.target.value })} /></label></div>
            <div className="grid md:grid-cols-2 gap-3"><label><span className="label">DPI</span><input className="input-base" type="number" value={form.dpi} onChange={(e) => setForm({ ...form, dpi: e.target.value })} /></label><label><span className="label">Fit mode</span><select className="input-base" value={form.fit_mode} onChange={(e) => setForm({ ...form, fit_mode: e.target.value })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="stretch">Stretch</option></select></label></div>
            <label><span className="label">Fixed print cost</span><input type="number" step="0.01" className="input-base" value={form.print_cost_max} onChange={(e) => setForm({ ...form, print_cost_max: e.target.value })} /></label>
          </section>
        )}

        {form.calculation_type !== "fixed" && (
          <section className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-5 space-y-4">
            <div><div className="overline mb-1">Pricing Calculation</div><p className="text-xs text-[var(--ff-muted-text)]">Only fields required for the selected calculation type are shown.</p></div>
            {["area_from_sheet", "sheet"].includes(form.calculation_type) && <div className="grid md:grid-cols-3 gap-3"><label><span className="label">Sheet W mm</span><input type="number" step="0.01" className="input-base" value={form.sheet_width_mm} onChange={(e) => recalcCostPerCm2({ sheet_width_mm: e.target.value })} /></label><label><span className="label">Sheet H mm</span><input type="number" step="0.01" className="input-base" value={form.sheet_height_mm} onChange={(e) => recalcCostPerCm2({ sheet_height_mm: e.target.value })} /></label><label><span className="label">Sheet cost</span><input type="number" step="0.01" className="input-base" value={form.sheet_cost} onChange={(e) => recalcCostPerCm2({ sheet_cost: e.target.value })} /></label></div>}
            {["area_from_sheet", "area_fixed_rate"].includes(form.calculation_type) && <div className="grid md:grid-cols-2 gap-3"><label><span className="label">Cost per cm²</span><input type="number" step="0.000001" className="input-base" value={form.cost_per_cm2} onChange={(e) => setForm({ ...form, cost_per_cm2: e.target.value })} /></label><label><span className="label">Minimum print cost</span><input type="number" step="0.01" className="input-base" value={form.minimum_print_cost} onChange={(e) => setForm({ ...form, minimum_print_cost: e.target.value })} /></label></div>}
            <div className="grid md:grid-cols-2 gap-3"><label><span className="label">Waste %</span><input type="number" step="0.01" className="input-base" value={form.waste_percentage} onChange={(e) => setForm({ ...form, waste_percentage: e.target.value })} /></label><label><span className="label">Markup %</span><input type="number" step="0.01" className="input-base" value={form.markup_percentage} onChange={(e) => setForm({ ...form, markup_percentage: e.target.value })} /></label></div>
            <div className="text-xs text-[var(--ff-muted-text)]">Estimated cm² rate: <b className="text-[var(--ff-card-text)]">R {Number(form.cost_per_cm2 || 0).toFixed(4)}</b>{Number(form.sheet_width_mm || 0) > 0 && Number(form.sheet_height_mm || 0) > 0 && <span> · Sheet area: {(((Number(form.sheet_width_mm || 0) / 10) * (Number(form.sheet_height_mm || 0) / 10))).toFixed(0)}cm²</span>}</div>
          </section>
        )}

        <section>
          <div className="label">Allowed placement tags</div>
          <div className="flex flex-wrap gap-2">
            {PRINT_PLACEMENT_TAGS.map((tag) => {
              const active = selectedPlacements.includes(tag.key);
              return <button type="button" key={tag.key} onClick={() => togglePlacement(tag.key)} className={`px-3 py-2 border text-xs uppercase tracking-widest font-bold ${active ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-button-primary-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:border-[var(--ff-primary)] hover:text-[var(--ff-card-text)]"}`}>{tag.label}</button>;
            })}
          </div>
          <input className="input-base mt-3" value={form.print_positions} onChange={(e) => setForm({ ...form, print_positions: e.target.value })} />
        </section>

        <div className="grid md:grid-cols-2 gap-4"><label><span className="label">Pricing notes</span><textarea className="input-base" rows={3} value={form.pricing_notes} onChange={(e) => setForm({ ...form, pricing_notes: e.target.value })} /></label><label><span className="label">Production notes</span><textarea className="input-base" rows={3} value={form.production_notes} onChange={(e) => setForm({ ...form, production_notes: e.target.value })} /></label></div>
        <label><span className="label">Status</span><select className="input-base" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>

        <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4 text-xs text-[var(--ff-muted-text)]">
          <div className="font-bold text-[var(--ff-card-text)] mb-1">Output preview</div>
          <div>{form.rule_name || "No rule name entered"}</div>
          <div>{resolvePrintSize(form)} · {resolveStandardKey(form)}</div>
          <div>Calculation: {form.calculation_type || "fixed"} · R {Number(form.cost_per_cm2 || 0).toFixed(4)}/cm² · min {money(Number(form.minimum_print_cost || 0))}</div>
        </div>

        <div className="flex flex-wrap gap-3"><button className="btn-primary"><Save size={14} /> {editingId ? "Save Changes" : "Create Pricing Rule"}</button><button type="button" onClick={cancelForm} className="btn-secondary">Cancel</button></div>
      </form>
    );
  }

  return (
    <div data-testid="admin-print-options-page" className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div><div className="overline mb-2">Product-side print taxonomy</div><h1 className="font-display text-5xl uppercase">Print Method Pricing</h1><p className="text-[var(--ff-muted-text)] mt-3 max-w-4xl">Define how each print method or pricing rule is calculated. Product templates decide which rules are allowed per print area.</p></div>
        <button type="button" className="btn-primary" onClick={startCreate}><Plus size={14} /> New Pricing Rule</button>
      </div>

      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal min-w-[1120px]">
          <thead><tr><th>Rule</th><th>Method Key</th><th>Calculation</th><th>Pricing</th><th>Output</th><th>Allowed Areas</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loadingRows && <tr><td colSpan={8} className="p-10 text-center text-[var(--ff-muted-text)] overline">Loading pricing rules…</td></tr>}
            {!loadingRows && rows.map((row) => (
              <tr key={row.id}>
                <td><div className="font-bold">{row.rule_name || row.print_method || "Untitled pricing rule"}</div><div className="text-xs text-[var(--ff-muted-text)]">{row.slug || "no slug"}</div></td>
                <td className="text-xs text-[var(--ff-muted-text)]">{row.method_key || "—"}</td>
                <td>{row.calculation_type || "fixed"}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{pricingSummary(row)}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{printOptionOutputLabel(row)}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{(row.print_positions || []).join(", ")}</td>
                <td><StatusBadge status={row.status || "active"} /></td>
                <td className="text-right whitespace-nowrap"><button type="button" onClick={() => startEdit(row)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] mr-3">Edit</button><button type="button" onClick={() => remove(row)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]">Delete</button></td>
              </tr>
            ))}
            {!loadingRows && rows.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-[var(--ff-muted-text)] overline">No pricing rules yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
