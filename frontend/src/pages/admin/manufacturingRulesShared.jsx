import React, { useState } from "react";
import { toast } from "sonner";
import { http } from "../../lib/api";
import { listText, numberValue, safeArray, textList } from "../../lib/unifiedManufacturingCosting";

export const METHOD_ORDER = ["dtf", "sublimation", "htv", "uv_dtf", "adhesive_vinyl"];
export const RULE_CACHE_KEY = "ff_builder_production_rules:v1";
export const PROFILE_CACHE_KEY = "ff_builder_print_options:v1";

export function sortMethods(items) {
  return [...safeArray(items)].sort((a, b) => {
    const ai = METHOD_ORDER.indexOf(a.method_key);
    const bi = METHOD_ORDER.indexOf(b.method_key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      || String(a.display_name || "").localeCompare(String(b.display_name || ""));
  });
}

export function sortColours(items) {
  return [...safeArray(items)].sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999)
    || String(a.name || "").localeCompare(String(b.name || "")));
}

export function colourDraft(colour) {
  return { ...colour, aliasesText: listText(colour.aliases), appliesToMethodsText: listText(colour.applies_to_methods) };
}

export function colourPayload(draft) {
  return {
    name: draft.name || "",
    hex: draft.hex || "#000000",
    active: draft.active !== false,
    aliases: textList(draft.aliasesText),
    applies_to_methods: textList(draft.appliesToMethodsText),
    sort_order: numberValue(draft.sort_order, 999),
  };
}

export function Stat({ label, value, icon }) {
  return <div className="ff-admin-stat-card"><div className="flex items-center justify-between gap-3"><div><p className="overline mb-1">{label}</p><div className="font-display text-3xl uppercase">{value}</div></div><div className="text-[var(--ff-primary)]">{icon}</div></div></div>;
}

export function Field({ label, hint, children }) {
  return <label className="ff-admin-field"><span className="ff-admin-label">{label}</span>{children}{hint && <span className="block mt-1 text-xs text-[var(--ff-muted-text)]">{hint}</span>}</label>;
}

export function Toggle({ label, checked, onChange }) {
  return <label className="flex items-center gap-3 text-sm ff-admin-muted"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export function NumericField({ label, value, onChange, step = "0.01", hint, readOnly = false }) {
  return <Field label={label} hint={hint}><input className="input-base" type="number" step={step} value={value ?? ""} readOnly={readOnly} onChange={(event) => { if (!readOnly) onChange(event.target.value); }} /></Field>;
}

export function MigrationPanel({ status, onReload }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  async function run(dryRun) {
    if (!dryRun && !window.confirm("Apply the unified manufacturing costing migration? Templates, live products, printer prices and Builder drafts will be backfilled. Historical orders will not change.")) return;
    setRunning(true);
    try {
      const response = await http.post("/production-rules/unified-costing/migrate", { dry_run: dryRun, strict: true });
      setResult(response.data || {});
      if (!dryRun) {
        window.localStorage.removeItem(RULE_CACHE_KEY);
        window.localStorage.removeItem(PROFILE_CACHE_KEY);
        toast.success("Manufacturing costing engine unified");
        await onReload();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not unify manufacturing costing");
    } finally {
      setRunning(false);
    }
  }

  const conflicts = safeArray(result?.alias_conflicts);
  const unmatched = safeArray(result?.active_unmatched_aliases);
  const canApply = Boolean(result?.dry_run) && conflicts.length === 0 && unmatched.length === 0;
  const complete = Boolean(status?.complete);

  return <div className={`ff-admin-card ${complete ? "ff-admin-success-border" : "border-[var(--ff-primary)]"}`}>
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
      <div className="max-w-3xl"><p className="overline mb-2">Unified costing engine</p><h2 className="font-display text-3xl uppercase">{complete ? "Manufacturing profiles are canonical" : "Merge legacy Print Options into Manufacturing Rules"}</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">Manufacturing profiles now own calculation type, rates, application cost, markup and placement rules. Legacy IDs remain compatibility aliases only.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={running} onClick={() => run(true)} className="btn-secondary">{running ? "Checking…" : "Preview migration"}</button>{!complete && <button type="button" disabled={running || !canApply} onClick={() => run(false)} className="btn-primary">{result?.dry_run ? "Apply unified engine" : "Preview first"}</button>}</div>
    </div>
    {result && <div className="mt-4 grid md:grid-cols-4 gap-3 text-sm">
      {[["Profiles", result.profiles_total], ["Aliases mapped", result.legacy_aliases_mapped], ["References", result.reference_changes], ["Blockers", conflicts.length + unmatched.length]].map(([label, value]) => <div key={label} className={`ff-admin-subpanel ${label === "Blockers" && value ? "ff-admin-danger-border" : ""}`}><span className="overline">{label}</span><div className="font-display text-2xl">{value || 0}</div></div>)}
      <div className="md:col-span-4 text-xs text-[var(--ff-muted-text)]">Templates: {result.templates_to_update || 0} · Products: {result.products_to_update || 0} · Printer prices: {result.printer_prices_to_update || 0} · Builder drafts: {result.builder_drafts_to_update || 0} · Orders updated: 0{unmatched.length > 0 && <span className="block ff-admin-danger-text mt-1">Apply is blocked until {unmatched.length} active legacy option(s) are mapped.</span>}</div>
    </div>}
  </div>;
}
