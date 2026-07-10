import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Factory, Palette, RefreshCw, Save, Settings, ShieldCheck } from "lucide-react";
import { http } from "../../lib/api";

const METHOD_ORDER = ["dtf", "sublimation", "htv", "uv_dtf", "adhesive_vinyl"];
const RULE_CACHE_KEY = "ff_builder_production_rules:v1";
const CALCULATION_TYPES = [
  ["fixed", "Fixed / max cost"],
  ["area_fixed_rate", "Area fixed rate / cm²"],
  ["area_from_sheet", "Area from sheet"],
  ["sheet", "Whole sheet"],
];
const RAW_COST_SOURCES = [
  ["print_option", "Legacy Print Option - current behaviour"],
  ["print_option_fallback_to_method", "Print Option first, method fallback"],
  ["production_method", "Production Method is costing source"],
];

const newColourDefault = {
  name: "",
  hex: "#000000",
  active: true,
  aliasesText: "",
  appliesToMethodsText: "htv\nadhesive_vinyl",
  sort_order: 999,
};

function uniqueBy(items, key) {
  const map = new Map();
  (items || []).forEach((item) => {
    const value = item?.[key];
    if (value && !map.has(value)) map.set(value, item);
  });
  return [...map.values()];
}

function sortMethods(items) {
  return [...(items || [])].sort((a, b) => {
    const ai = METHOD_ORDER.indexOf(a.method_key);
    const bi = METHOD_ORDER.indexOf(b.method_key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || String(a.display_name || "").localeCompare(String(b.display_name || ""));
  });
}

function sortColours(items) {
  return [...(items || [])].sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999) || String(a.name || "").localeCompare(String(b.name || "")));
}

function listText(list) {
  return Array.isArray(list) ? list.join("\n") : "";
}

function textList(text) {
  return [...new Set(String(text || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
}

function numberValue(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function normaliseColourMode(method) {
  const mode = method?.creator_restrictions?.colour_picker || method?.supported_colours?.mode || "rgb";
  return ["stocked_library", "restricted_library"].includes(mode) ? "stocked_library" : "rgb";
}

function embeddedColourIds(method, colours) {
  const tokens = new Set((method?.supported_colours?.colours || []).flatMap((colour) => [colour.id, colour.name, colour.hex]).filter(Boolean).map((value) => String(value).toLowerCase()));
  return colours.filter((colour) => tokens.has(String(colour.id || "").toLowerCase()) || tokens.has(String(colour.name || "").toLowerCase()) || tokens.has(String(colour.hex || "").toLowerCase())).map((colour) => colour.id);
}

function makeMethodDraft(method, colours) {
  const cost = method?.cost_calculation_model || {};
  return {
    ...method,
    categoriesText: listText(method.supported_product_categories),
    materialsText: listText(method.supported_materials),
    artworkTypesText: listText(method.supported_artwork_types),
    colourMode: normaliseColourMode(method),
    selectedColourIds: embeddedColourIds(method, colours),
    maxLayers: method?.layer_behaviour?.max_layers ?? "",
    everyColourCreatesLayer: Boolean(method?.layer_behaviour?.colour_creates_layer || method?.layer_behaviour?.every_colour_creates_layer),
    pressCountModel: method?.press_behaviour?.press_count_model || method?.press_behaviour?.model || "one_press_per_print_area",
    secondsPerPress: method?.press_behaviour?.seconds_per_press ?? "",
    setupSeconds: method?.press_behaviour?.setup_seconds ?? "",
    costModelName: cost.model || cost.name || "",
    rawCostSource: cost.raw_cost_source || "print_option",
    calculationType: cost.calculation_type || "fixed",
    methodPrintCostMax: cost.print_cost_max ?? cost.platform_print_cost ?? "",
    sheetWidthMm: cost.sheet_width_mm ?? "",
    sheetHeightMm: cost.sheet_height_mm ?? "",
    sheetCost: cost.sheet_cost ?? "",
    costPerCm2: cost.cost_per_cm2 ?? "",
    minimumPrintCost: cost.minimum_print_cost ?? "",
    wastePercentage: cost.waste_percentage ?? "",
    markupPercentage: cost.markup_percentage ?? "",
    creatorPrintPrice: cost.creator_print_price ?? "",
    platformPrintMarkupType: cost.platform_print_markup_type || "manual",
    platformPrintMarkupValue: cost.platform_print_markup_value ?? "",
    pricingNotes: cost.pricing_notes || "",
  };
}

function makeColourDraft(colour) {
  return {
    ...colour,
    aliasesText: listText(colour.aliases),
    appliesToMethodsText: listText(colour.applies_to_methods),
  };
}

function methodPayload(draft, colours) {
  const selectedColours = colours
    .filter((colour) => (draft.selectedColourIds || []).includes(colour.id))
    .map((colour) => ({ id: colour.id, name: colour.name, hex: colour.hex, aliases: colour.aliases || [], active: colour.active !== false }));

  const stocked = draft.colourMode === "stocked_library";
  const costModel = {
    ...(draft.cost_calculation_model || {}),
    model: draft.costModelName || `${draft.method_key || "method"}_costing`,
    raw_cost_source: draft.rawCostSource || "print_option",
    calculation_type: draft.calculationType || "fixed",
    print_cost_max: nullableNumber(draft.methodPrintCostMax),
    platform_print_cost: nullableNumber(draft.methodPrintCostMax),
    sheet_width_mm: nullableNumber(draft.sheetWidthMm),
    sheet_height_mm: nullableNumber(draft.sheetHeightMm),
    sheet_cost: nullableNumber(draft.sheetCost),
    cost_per_cm2: nullableNumber(draft.costPerCm2),
    minimum_print_cost: nullableNumber(draft.minimumPrintCost),
    waste_percentage: nullableNumber(draft.wastePercentage),
    markup_percentage: nullableNumber(draft.markupPercentage),
    creator_print_price: nullableNumber(draft.creatorPrintPrice),
    platform_print_markup_type: draft.platformPrintMarkupType || "manual",
    platform_print_markup_value: nullableNumber(draft.platformPrintMarkupValue),
    pricing_notes: draft.pricingNotes || "",
  };

  return {
    display_name: draft.display_name || draft.method_key,
    description: draft.description || "",
    active: draft.active !== false,
    default_production_lead_time_days: numberValue(draft.default_production_lead_time_days, 0),
    supported_product_categories: textList(draft.categoriesText),
    supported_materials: textList(draft.materialsText),
    supported_artwork_types: textList(draft.artworkTypesText),
    maximum_artwork_width_mm: nullableNumber(draft.maximum_artwork_width_mm),
    maximum_artwork_height_mm: nullableNumber(draft.maximum_artwork_height_mm),
    minimum_artwork_width_mm: nullableNumber(draft.minimum_artwork_width_mm),
    minimum_artwork_height_mm: nullableNumber(draft.minimum_artwork_height_mm),
    minimum_resolution_dpi: numberValue(draft.minimum_resolution_dpi, 0),
    transparent_background_required: Boolean(draft.transparent_background_required),
    mirror_artwork_required: Boolean(draft.mirror_artwork_required),
    gang_sheet_capable: Boolean(draft.gang_sheet_capable),
    supported_colours: {
      ...(draft.supported_colours || {}),
      mode: stocked ? "restricted_library" : "unlimited_rgb",
      library_id: stocked ? "default-stocked-vinyl-colours" : null,
      colours: stocked ? selectedColours : [],
    },
    creator_restrictions: {
      ...(draft.creator_restrictions || {}),
      colour_picker: stocked ? "stocked_library" : "rgb",
      requires_stocked_colour_selection: stocked,
    },
    layer_behaviour: {
      ...(draft.layer_behaviour || {}),
      colour_creates_layer: Boolean(draft.everyColourCreatesLayer),
      every_colour_creates_layer: Boolean(draft.everyColourCreatesLayer),
      max_layers: draft.maxLayers === "" ? null : numberValue(draft.maxLayers, 0),
    },
    press_behaviour: {
      ...(draft.press_behaviour || {}),
      press_count_model: draft.pressCountModel || "one_press_per_print_area",
      model: draft.pressCountModel || draft.press_behaviour?.model || "one_press_per_print_area",
      seconds_per_press: nullableNumber(draft.secondsPerPress),
      setup_seconds: nullableNumber(draft.setupSeconds),
    },
    cost_calculation_model: costModel,
    validation_rules: {
      ...(draft.validation_rules || {}),
      enforce_colour_library: stocked,
    },
    admin_notes: draft.admin_notes || "",
  };
}

function colourPayload(draft) {
  return {
    name: draft.name || "",
    hex: draft.hex || "#000000",
    active: draft.active !== false,
    aliases: textList(draft.aliasesText),
    applies_to_methods: textList(draft.appliesToMethodsText),
    sort_order: numberValue(draft.sort_order, 999),
  };
}

function Stat({ label, value, icon }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="overline mb-1">{label}</p>
          <div className="font-display text-3xl uppercase">{value}</div>
        </div>
        <div className="text-[var(--ff-primary)]">{icon}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-xs text-[var(--ff-muted-text)]">{hint}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 text-sm text-[var(--ff-muted-text)]">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function CostingEditor({ method, onPatch }) {
  return (
    <div className="border border-[var(--ff-card-border)] p-4 space-y-4 bg-black/20">
      <div>
        <p className="overline mb-1">Costing Model</p>
        <h3 className="font-display text-2xl uppercase">Print Option-compatible pricing</h3>
        <p className="text-xs text-[var(--ff-muted-text)] mt-1">This mirrors the existing Print Options calculation fields. Keep source as Legacy Print Option until each method is verified.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Costing source">
          <select className="input-base" value={method.rawCostSource || "print_option"} onChange={(event) => onPatch({ rawCostSource: event.target.value })}>
            {RAW_COST_SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Calculation type">
          <select className="input-base" value={method.calculationType || "fixed"} onChange={(event) => onPatch({ calculationType: event.target.value })}>
            {CALCULATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Cost model name"><input className="input-base" value={method.costModelName || ""} onChange={(event) => onPatch({ costModelName: event.target.value })} /></Field>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Fixed / max cost"><input className="input-base" type="number" step="0.01" value={method.methodPrintCostMax ?? ""} onChange={(event) => onPatch({ methodPrintCostMax: event.target.value })} /></Field>
        <Field label="Cost per cm²"><input className="input-base" type="number" step="0.0001" value={method.costPerCm2 ?? ""} onChange={(event) => onPatch({ costPerCm2: event.target.value })} /></Field>
        <Field label="Minimum print cost"><input className="input-base" type="number" step="0.01" value={method.minimumPrintCost ?? ""} onChange={(event) => onPatch({ minimumPrintCost: event.target.value })} /></Field>
        <Field label="Creator fixed price"><input className="input-base" type="number" step="0.01" value={method.creatorPrintPrice ?? ""} onChange={(event) => onPatch({ creatorPrintPrice: event.target.value })} /></Field>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Sheet width mm"><input className="input-base" type="number" step="0.01" value={method.sheetWidthMm ?? ""} onChange={(event) => onPatch({ sheetWidthMm: event.target.value })} /></Field>
        <Field label="Sheet height mm"><input className="input-base" type="number" step="0.01" value={method.sheetHeightMm ?? ""} onChange={(event) => onPatch({ sheetHeightMm: event.target.value })} /></Field>
        <Field label="Sheet cost"><input className="input-base" type="number" step="0.01" value={method.sheetCost ?? ""} onChange={(event) => onPatch({ sheetCost: event.target.value })} /></Field>
        <Field label="Waste %"><input className="input-base" type="number" step="0.01" value={method.wastePercentage ?? ""} onChange={(event) => onPatch({ wastePercentage: event.target.value })} /></Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Markup %"><input className="input-base" type="number" step="0.01" value={method.markupPercentage ?? ""} onChange={(event) => onPatch({ markupPercentage: event.target.value })} /></Field>
        <Field label="Platform markup type"><select className="input-base" value={method.platformPrintMarkupType || "manual"} onChange={(event) => onPatch({ platformPrintMarkupType: event.target.value })}><option value="manual">Manual / value</option><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></Field>
        <Field label="Platform markup value"><input className="input-base" type="number" step="0.01" value={method.platformPrintMarkupValue ?? ""} onChange={(event) => onPatch({ platformPrintMarkupValue: event.target.value })} /></Field>
      </div>
      <Field label="Pricing notes"><textarea className="input-base min-h-[80px]" value={method.pricingNotes || ""} onChange={(event) => onPatch({ pricingNotes: event.target.value })} /></Field>
    </div>
  );
}

export default function AdminManufacturingRules() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("methods");
  const [methods, setMethods] = useState([]);
  const [colours, setColours] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settingsAllowed, setSettingsAllowed] = useState(true);
  const [methodDrafts, setMethodDrafts] = useState({});
  const [colourDrafts, setColourDrafts] = useState({});
  const [selectedMethodKey, setSelectedMethodKey] = useState("");
  const [newColour, setNewColour] = useState(newColourDefault);

  const selectedMethod = selectedMethodKey ? methodDrafts[selectedMethodKey] : null;
  const restrictedCount = useMemo(() => methods.filter((method) => normaliseColourMode(method) === "stocked_library").length, [methods]);
  const methodCostingCount = useMemo(() => methods.filter((method) => (method.cost_calculation_model || {}).raw_cost_source === "production_method").length, [methods]);

  async function loadRules() {
    setLoading(true);
    try {
      const [activeMethods, inactiveMethods, activeColours, inactiveColours] = await Promise.all([
        http.get("/production-rules/methods?active=true"),
        http.get("/production-rules/methods?active=false"),
        http.get("/production-rules/stocked-colours?active=true"),
        http.get("/production-rules/stocked-colours?active=false"),
      ]);
      const nextColours = sortColours(uniqueBy([...(activeColours.data || []), ...(inactiveColours.data || [])], "id"));
      const nextMethods = sortMethods(uniqueBy([...(activeMethods.data || []), ...(inactiveMethods.data || [])], "method_key"));
      setColours(nextColours);
      setMethods(nextMethods);
      setColourDrafts(Object.fromEntries(nextColours.map((colour) => [colour.id, makeColourDraft(colour)])));
      setMethodDrafts(Object.fromEntries(nextMethods.map((method) => [method.method_key, makeMethodDraft(method, nextColours)])));
      setSelectedMethodKey((previous) => previous || nextMethods[0]?.method_key || "");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load production rules");
    }

    try {
      const response = await http.get("/production-rules/settings");
      setSettings(response.data || {});
      setSettingsAllowed(true);
    } catch (error) {
      setSettingsAllowed(false);
      if (error.response?.status !== 403) toast.error(error.response?.data?.detail || "Could not load production settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRules(); }, []);

  function patchMethod(methodKey, updates) {
    setMethodDrafts((previous) => ({ ...previous, [methodKey]: { ...previous[methodKey], ...updates } }));
  }

  function patchColour(colourId, updates) {
    setColourDrafts((previous) => ({ ...previous, [colourId]: { ...previous[colourId], ...updates } }));
  }

  async function saveMethod(methodKey) {
    const draft = methodDrafts[methodKey];
    if (!draft) return;
    setSaving(true);
    try {
      const response = await http.patch(`/production-rules/methods/${methodKey}`, methodPayload(draft, colours));
      const updated = response.data;
      const nextMethods = sortMethods(methods.map((method) => method.method_key === methodKey ? updated : method));
      setMethods(nextMethods);
      setMethodDrafts((previous) => ({ ...previous, [methodKey]: makeMethodDraft(updated, colours) }));
      window.localStorage.removeItem(RULE_CACHE_KEY);
      toast.success("Production method saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save production method");
    } finally {
      setSaving(false);
    }
  }

  async function saveColour(colourId) {
    const draft = colourDrafts[colourId];
    if (!draft) return;
    setSaving(true);
    try {
      const response = await http.patch(`/production-rules/stocked-colours/${colourId}`, colourPayload(draft));
      const updated = response.data;
      const nextColours = sortColours(colours.map((colour) => colour.id === colourId ? updated : colour));
      setColours(nextColours);
      setColourDrafts((previous) => ({ ...previous, [colourId]: makeColourDraft(updated) }));
      window.localStorage.removeItem(RULE_CACHE_KEY);
      toast.success("Stocked colour saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save stocked colour");
    } finally {
      setSaving(false);
    }
  }

  async function createColour() {
    if (!newColour.name.trim()) { toast.error("Enter a colour name"); return; }
    setSaving(true);
    try {
      const response = await http.post("/production-rules/stocked-colours", colourPayload(newColour));
      const created = response.data;
      const nextColours = sortColours(uniqueBy([...colours, created], "id"));
      setColours(nextColours);
      setColourDrafts((previous) => ({ ...previous, [created.id]: makeColourDraft(created) }));
      setNewColour(newColourDefault);
      window.localStorage.removeItem(RULE_CACHE_KEY);
      toast.success("Stocked colour created");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create stocked colour");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await http.patch("/production-rules/settings", {
        default_packaging_cost: numberValue(settings.default_packaging_cost, 0),
        default_packaging_creator_markup_percent: numberValue(settings.default_packaging_creator_markup_percent, 0),
        minimum_creator_profit_required: numberValue(settings.minimum_creator_profit_required, 0),
        fail_publish_on_warnings: Boolean(settings.fail_publish_on_warnings),
        allow_unknown_material_with_warning: Boolean(settings.allow_unknown_material_with_warning),
        allow_unknown_category_with_warning: Boolean(settings.allow_unknown_category_with_warning),
        notes: settings.notes || "",
      });
      setSettings(response.data || {});
      toast.success("Production settings saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save production settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="admin-workspace min-h-screen flex items-center justify-center overline">Loading manufacturing rules…</div>;

  return (
    <div className="admin-workspace min-h-screen text-[var(--ff-card-text)] bg-[var(--ff-page-bg)]">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="overline mb-2">Admin / Production</p>
            <h1 className="font-display text-5xl uppercase">Manufacturing Rules</h1>
            <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Edit print methods, stocked colour restrictions, layer logic, press behaviour and the Print Option-compatible costing model used by Builder pricing.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin" className="px-4 py-3 border border-[var(--ff-card-border)] text-xs uppercase tracking-widest font-bold hover:border-[var(--ff-primary)]">Back to Admin</Link>
            <button type="button" onClick={loadRules} className="btn-secondary flex items-center gap-2"><RefreshCw size={14} /> Refresh</button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Stat label="Print Methods" value={methods.length} icon={<Factory size={28} />} />
          <Stat label="Stock Colours" value={colours.filter((colour) => colour.active !== false).length} icon={<Palette size={28} />} />
          <Stat label="Restricted" value={restrictedCount} icon={<ShieldCheck size={28} />} />
          <Stat label="Method Costing" value={methodCostingCount} icon={<Settings size={28} />} />
        </div>

        {!settingsAllowed && (
          <div className="card border-yellow-500/60 flex gap-3 text-sm text-[var(--ff-muted-text)]"><AlertTriangle className="text-yellow-400 shrink-0" size={20} /><div><strong className="text-[var(--ff-card-text)]">Super admin required.</strong> You can view rules, but saving methods, colours and settings requires super_admin.</div></div>
        )}

        <div className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-4">
          {[["methods", "Print Methods"], ["colours", "Stocked Colours"], ["settings", "Costing Settings"]].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`px-4 py-3 border text-xs uppercase tracking-widest font-bold ${activeTab === key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}>{label}</button>
          ))}
        </div>

        {activeTab === "methods" && (
          <div className="grid lg:grid-cols-[320px,1fr] gap-6">
            <div className="card space-y-3 h-fit">
              <p className="overline">Production Methods</p>
              {methods.map((method) => (
                <button key={method.method_key} type="button" onClick={() => setSelectedMethodKey(method.method_key)} className={`w-full text-left border p-4 ${selectedMethodKey === method.method_key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]/10" : "border-[var(--ff-card-border)] hover:border-[var(--ff-primary)]"}`}>
                  <div className="flex items-center justify-between gap-2"><div className="font-display text-xl uppercase">{method.display_name || method.method_key}</div>{method.active !== false ? <CheckCircle2 size={16} className="text-green-400" /> : <AlertTriangle size={16} className="text-yellow-400" />}</div>
                  <div className="text-xs text-[var(--ff-muted-text)] mt-1 uppercase tracking-widest">{method.method_key}</div>
                  <div className="text-[10px] text-[var(--ff-muted-text)] mt-2 uppercase tracking-widest">{(method.cost_calculation_model || {}).raw_cost_source || "print_option"}</div>
                </button>
              ))}
            </div>

            {selectedMethod && (
              <div className="card space-y-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div><p className="overline mb-2">Selected Method</p><h2 className="font-display text-4xl uppercase">{selectedMethod.display_name || selectedMethod.method_key}</h2><p className="text-xs text-[var(--ff-muted-text)] uppercase tracking-widest mt-1">{selectedMethod.method_key}</p></div>
                  <button type="button" onClick={() => saveMethod(selectedMethod.method_key)} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={14} /> Save Method</button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Display name"><input className="input-base" value={selectedMethod.display_name || ""} onChange={(event) => patchMethod(selectedMethod.method_key, { display_name: event.target.value })} /></Field>
                  <Field label="Lead time days"><input className="input-base" type="number" min="0" value={selectedMethod.default_production_lead_time_days ?? 0} onChange={(event) => patchMethod(selectedMethod.method_key, { default_production_lead_time_days: event.target.value })} /></Field>
                  <div className="md:col-span-2"><Field label="Description"><textarea className="input-base min-h-[88px]" value={selectedMethod.description || ""} onChange={(event) => patchMethod(selectedMethod.method_key, { description: event.target.value })} /></Field></div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <Toggle checked={selectedMethod.active !== false} onChange={(checked) => patchMethod(selectedMethod.method_key, { active: checked })} label="Method active" />
                  <Toggle checked={selectedMethod.transparent_background_required} onChange={(checked) => patchMethod(selectedMethod.method_key, { transparent_background_required: checked })} label="Transparent required" />
                  <Toggle checked={selectedMethod.mirror_artwork_required} onChange={(checked) => patchMethod(selectedMethod.method_key, { mirror_artwork_required: checked })} label="Mirror required" />
                  <Toggle checked={selectedMethod.gang_sheet_capable} onChange={(checked) => patchMethod(selectedMethod.method_key, { gang_sheet_capable: checked })} label="Gang sheet capable" />
                  <Toggle checked={selectedMethod.everyColourCreatesLayer} onChange={(checked) => patchMethod(selectedMethod.method_key, { everyColourCreatesLayer: checked })} label="Each colour creates layer" />
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <Field label="Colour mode"><select className="input-base" value={selectedMethod.colourMode || "rgb"} onChange={(event) => patchMethod(selectedMethod.method_key, { colourMode: event.target.value })}><option value="rgb">Full RGB / full colour</option><option value="stocked_library">Stocked library only</option></select></Field>
                  <Field label="Max layers"><input className="input-base" type="number" min="0" value={selectedMethod.maxLayers ?? ""} onChange={(event) => patchMethod(selectedMethod.method_key, { maxLayers: event.target.value })} /></Field>
                  <Field label="Minimum DPI"><input className="input-base" type="number" min="0" value={selectedMethod.minimum_resolution_dpi ?? 0} onChange={(event) => patchMethod(selectedMethod.method_key, { minimum_resolution_dpi: event.target.value })} /></Field>
                </div>

                <CostingEditor method={selectedMethod} onPatch={(updates) => patchMethod(selectedMethod.method_key, updates)} />

                {selectedMethod.colourMode === "stocked_library" && (
                  <div className="border border-[var(--ff-card-border)] p-4 space-y-3">
                    <div><p className="overline mb-1">Approved colours for this method</p><p className="text-xs text-[var(--ff-muted-text)]">This embedded list is what the Creator Builder uses for HTV/vinyl restrictions.</p></div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {colours.map((colour) => (
                        <label key={colour.id} className={`flex items-center gap-3 border p-3 ${colour.active === false ? "opacity-50" : ""} border-[var(--ff-card-border)]`}>
                          <input type="checkbox" checked={(selectedMethod.selectedColourIds || []).includes(colour.id)} onChange={(event) => { const current = new Set(selectedMethod.selectedColourIds || []); if (event.target.checked) current.add(colour.id); else current.delete(colour.id); patchMethod(selectedMethod.method_key, { selectedColourIds: [...current] }); }} />
                          <span className="w-6 h-6 border border-black/40" style={{ background: colour.hex }} />
                          <span className="text-sm">{colour.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Supported categories" hint="One per line."><textarea className="input-base min-h-[110px]" value={selectedMethod.categoriesText || ""} onChange={(event) => patchMethod(selectedMethod.method_key, { categoriesText: event.target.value })} /></Field>
                  <Field label="Supported materials" hint="One per line."><textarea className="input-base min-h-[110px]" value={selectedMethod.materialsText || ""} onChange={(event) => patchMethod(selectedMethod.method_key, { materialsText: event.target.value })} /></Field>
                  <Field label="Supported artwork types" hint="One per line."><textarea className="input-base min-h-[88px]" value={selectedMethod.artworkTypesText || ""} onChange={(event) => patchMethod(selectedMethod.method_key, { artworkTypesText: event.target.value })} /></Field>
                  <Field label="Admin notes"><textarea className="input-base min-h-[88px]" value={selectedMethod.admin_notes || ""} onChange={(event) => patchMethod(selectedMethod.method_key, { admin_notes: event.target.value })} /></Field>
                </div>

                <div className="grid md:grid-cols-4 gap-4">
                  <Field label="Min width mm"><input className="input-base" type="number" value={selectedMethod.minimum_artwork_width_mm ?? 0} onChange={(event) => patchMethod(selectedMethod.method_key, { minimum_artwork_width_mm: event.target.value })} /></Field>
                  <Field label="Min height mm"><input className="input-base" type="number" value={selectedMethod.minimum_artwork_height_mm ?? 0} onChange={(event) => patchMethod(selectedMethod.method_key, { minimum_artwork_height_mm: event.target.value })} /></Field>
                  <Field label="Max width mm"><input className="input-base" type="number" value={selectedMethod.maximum_artwork_width_mm ?? 0} onChange={(event) => patchMethod(selectedMethod.method_key, { maximum_artwork_width_mm: event.target.value })} /></Field>
                  <Field label="Max height mm"><input className="input-base" type="number" value={selectedMethod.maximum_artwork_height_mm ?? 0} onChange={(event) => patchMethod(selectedMethod.method_key, { maximum_artwork_height_mm: event.target.value })} /></Field>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <Field label="Press count model"><select className="input-base" value={selectedMethod.pressCountModel || "one_press_per_print_area"} onChange={(event) => patchMethod(selectedMethod.method_key, { pressCountModel: event.target.value })}><option value="one_press_per_print_area">Per print area</option><option value="one_press_per_layer">Per layer</option><option value="one_application_per_layer">Per colour/application layer</option><option value="manual">Manual/custom</option></select></Field>
                  <Field label="Seconds per press"><input className="input-base" type="number" min="0" value={selectedMethod.secondsPerPress ?? ""} onChange={(event) => patchMethod(selectedMethod.method_key, { secondsPerPress: event.target.value })} /></Field>
                  <Field label="Setup seconds"><input className="input-base" type="number" min="0" value={selectedMethod.setupSeconds ?? ""} onChange={(event) => patchMethod(selectedMethod.method_key, { setupSeconds: event.target.value })} /></Field>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "colours" && (
          <div className="space-y-6">
            <div className="card space-y-4">
              <div><p className="overline mb-2">Create Colour</p><h2 className="font-display text-3xl uppercase">Add stocked colour</h2></div>
              <div className="grid md:grid-cols-[1fr,150px,1fr,120px] gap-4 items-end">
                <Field label="Name"><input className="input-base" value={newColour.name} onChange={(event) => setNewColour((prev) => ({ ...prev, name: event.target.value }))} /></Field>
                <Field label="Hex"><input className="input-base" type="color" value={newColour.hex} onChange={(event) => setNewColour((prev) => ({ ...prev, hex: event.target.value }))} /></Field>
                <Field label="Applies to methods"><textarea className="input-base min-h-[60px]" value={newColour.appliesToMethodsText} onChange={(event) => setNewColour((prev) => ({ ...prev, appliesToMethodsText: event.target.value }))} /></Field>
                <button type="button" onClick={createColour} disabled={saving} className="btn-primary h-12">Create</button>
              </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
              {colours.map((colour) => {
                const draft = colourDrafts[colour.id] || makeColourDraft(colour);
                return (
                  <div key={colour.id} className={`card space-y-4 ${draft.active === false ? "opacity-70" : ""}`}>
                    <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="w-10 h-10 border border-black/40" style={{ background: draft.hex }} /><div><p className="overline mb-1">{colour.id}</p><h3 className="font-display text-2xl uppercase">{draft.name}</h3></div></div><button type="button" onClick={() => saveColour(colour.id)} disabled={saving} className="btn-secondary flex items-center gap-2"><Save size={14} /> Save</button></div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Field label="Name"><input className="input-base" value={draft.name || ""} onChange={(event) => patchColour(colour.id, { name: event.target.value })} /></Field>
                      <Field label="Hex"><input className="input-base" type="color" value={draft.hex || "#000000"} onChange={(event) => patchColour(colour.id, { hex: event.target.value })} /></Field>
                      <Field label="Sort order"><input className="input-base" type="number" value={draft.sort_order ?? 999} onChange={(event) => patchColour(colour.id, { sort_order: event.target.value })} /></Field>
                      <div className="pt-7"><Toggle checked={draft.active !== false} onChange={(checked) => patchColour(colour.id, { active: checked })} label="Colour active" /></div>
                      <Field label="Aliases"><textarea className="input-base min-h-[72px]" value={draft.aliasesText || ""} onChange={(event) => patchColour(colour.id, { aliasesText: event.target.value })} /></Field>
                      <Field label="Applies to methods"><textarea className="input-base min-h-[72px]" value={draft.appliesToMethodsText || ""} onChange={(event) => patchColour(colour.id, { appliesToMethodsText: event.target.value })} /></Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="card space-y-6">
            {!settings ? <div className="text-sm text-[var(--ff-muted-text)]">Production settings are only available to super admin users.</div> : (
              <>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4"><div><p className="overline mb-2">Manufacturing Costing</p><h2 className="font-display text-4xl uppercase">Default cost controls</h2><p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">These values feed the server-side minimum selling price and publish validation.</p></div><button type="button" onClick={saveSettings} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={14} /> Save Settings</button></div>
                <div className="grid md:grid-cols-3 gap-4">
                  <Field label="Default packaging cost"><input className="input-base" type="number" step="0.01" value={settings.default_packaging_cost ?? 0} onChange={(event) => setSettings((prev) => ({ ...prev, default_packaging_cost: event.target.value }))} /></Field>
                  <Field label="Packaging creator markup %"><input className="input-base" type="number" step="0.01" value={settings.default_packaging_creator_markup_percent ?? 0} onChange={(event) => setSettings((prev) => ({ ...prev, default_packaging_creator_markup_percent: event.target.value }))} /></Field>
                  <Field label="Minimum creator profit"><input className="input-base" type="number" step="0.01" value={settings.minimum_creator_profit_required ?? 0} onChange={(event) => setSettings((prev) => ({ ...prev, minimum_creator_profit_required: event.target.value }))} /></Field>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <Toggle checked={settings.fail_publish_on_warnings} onChange={(checked) => setSettings((prev) => ({ ...prev, fail_publish_on_warnings: checked }))} label="Block publish on warnings" />
                  <Toggle checked={settings.allow_unknown_material_with_warning} onChange={(checked) => setSettings((prev) => ({ ...prev, allow_unknown_material_with_warning: checked }))} label="Allow unknown material warning" />
                  <Toggle checked={settings.allow_unknown_category_with_warning} onChange={(checked) => setSettings((prev) => ({ ...prev, allow_unknown_category_with_warning: checked }))} label="Allow unknown category warning" />
                </div>
                <Field label="Admin notes"><textarea className="input-base min-h-[120px]" value={settings.notes || ""} onChange={(event) => setSettings((prev) => ({ ...prev, notes: event.target.value }))} /></Field>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
