import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { toast } from "sonner";
import { Factory, Palette, RefreshCw, Save, Settings, ShieldCheck } from "lucide-react";
import { http } from "../../lib/api";
import {
  duplicateCostingProfile,
  methodDraft,
  methodPayload,
  newCostingProfile,
  safeArray,
} from "../../lib/unifiedManufacturingCosting";
import ManufacturingProfilesPanel from "./ManufacturingProfilesPanel";
import {
  Field,
  MigrationPanel,
  NumericField,
  Stat,
  Toggle,
  colourDraft,
  colourPayload,
  sortColours,
  sortMethods,
} from "./manufacturingRulesShared";

const emptyColour = { name: "", hex: "#000000", active: true, aliasesText: "", appliesToMethodsText: "htv\nadhesive_vinyl", sort_order: 999 };

export default function AdminManufacturingRulesUnified({ activeSection = "methods" }) {
  const [methods, setMethods] = useState([]);
  const [colours, setColours] = useState([]);
  const [colourDrafts, setColourDrafts] = useState({});
  const [settings, setSettings] = useState(null);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [selectedKey, setSelectedKey] = useState("dtf");
  const [newColour, setNewColour] = useState(emptyColour);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [methodResponse, colourResponse] = await Promise.all([
        http.get("/production-rules/methods", { params: { active: null } }),
        http.get("/production-rules/stocked-colours", { params: { active: null } }),
      ]);
      const nextColours = sortColours(colourResponse.data || []);
      const nextMethods = sortMethods(methodResponse.data || []).map((method) => methodDraft(method, nextColours));
      setColours(nextColours);
      setMethods(nextMethods);
      setColourDrafts(Object.fromEntries(nextColours.map((colour) => [colour.id, colourDraft(colour)])));
      setSelectedKey((current) => nextMethods.some((method) => method.method_key === current)
        ? current
        : (nextMethods[0]?.method_key || ""));

      const [settingsResult, statusResult] = await Promise.allSettled([
        http.get("/production-rules/settings"),
        http.get("/production-rules/unified-costing/status"),
      ]);
      if (settingsResult.status === "fulfilled") setSettings(settingsResult.value.data || {});
      if (statusResult.status === "fulfilled") setMigrationStatus(statusResult.value.data || {});
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load Manufacturing Rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const restrictedCount = useMemo(() => methods.filter((method) => method.colourMode === "stocked_library").length, [methods]);
  const profileCount = useMemo(() => methods.reduce((total, method) => total + safeArray(method.profiles).length, 0), [methods]);

  function patchMethod(methodKey, updates) {
    setMethods((current) => current.map((method) => method.method_key === methodKey ? { ...method, ...updates } : method));
  }

  function patchProfile(methodKey, index, updates) {
    setMethods((current) => current.map((method) => {
      if (method.method_key !== methodKey) return method;
      return { ...method, profiles: safeArray(method.profiles).map((profile, profileIndex) => profileIndex === index ? { ...profile, ...updates } : profile) };
    }));
  }

  function setDefaultProfile(methodKey, index) {
    setMethods((current) => current.map((method) => method.method_key !== methodKey ? method : {
      ...method,
      profiles: safeArray(method.profiles).map((profile, profileIndex) => ({ ...profile, is_default: profileIndex === index })),
    }));
  }

  function duplicateProfile(methodKey, index) {
    setMethods((current) => current.map((method) => method.method_key !== methodKey ? method : {
      ...method,
      profiles: [...safeArray(method.profiles), duplicateCostingProfile(method.profiles[index], methodKey, method.profiles.length)],
    }));
  }

  function addProfile(methodKey) {
    setMethods((current) => current.map((method) => method.method_key !== methodKey ? method : {
      ...method,
      profiles: [...safeArray(method.profiles), newCostingProfile(methodKey, method.profiles.length)],
    }));
  }

  async function saveMethod(methodKey) {
    const draft = methods.find((method) => method.method_key === methodKey);
    if (!draft) return;
    setSaving(true);
    try {
      const response = await http.patch(`/production-rules/methods/${methodKey}`, methodPayload(draft, colours));
      setMethods((current) => current.map((method) => method.method_key === methodKey ? methodDraft(response.data, colours) : method));
      toast.success(`${draft.display_name} saved`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save method");
    } finally {
      setSaving(false);
    }
  }

  function patchColour(id, updates) {
    setColourDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), ...updates } }));
  }

  async function saveColour(id) {
    setSaving(true);
    try {
      const response = await http.patch(`/production-rules/stocked-colours/${id}`, colourPayload(colourDrafts[id] || {}));
      const updated = response.data;
      setColours((current) => sortColours(current.map((colour) => colour.id === id ? updated : colour)));
      setColourDrafts((current) => ({ ...current, [id]: colourDraft(updated) }));
      toast.success("Stocked colour saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save colour");
    } finally {
      setSaving(false);
    }
  }

  async function createColour() {
    if (!newColour.name.trim()) return toast.error("Colour name is required");
    setSaving(true);
    try {
      const response = await http.post("/production-rules/stocked-colours", colourPayload(newColour));
      const created = response.data;
      setColours((current) => sortColours([...current, created]));
      setColourDrafts((current) => ({ ...current, [created.id]: colourDraft(created) }));
      setNewColour(emptyColour);
      toast.success("Stocked colour created");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create colour");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await http.patch("/production-rules/settings", settings);
      setSettings(response.data || {});
      toast.success("Production settings saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-shell min-h-screen flex items-center justify-center"><RefreshCw className="animate-spin" /></div>;

  return <div className="page-shell min-h-screen py-8"><div className="max-w-7xl mx-auto px-4 space-y-6">
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4"><div><p className="overline mb-2">Admin / Production</p><h1 className="font-display text-5xl uppercase">Manufacturing Rules</h1><p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">One engine for method behaviour, costing profiles, stocked-colour restrictions and production validation.</p></div><div className="flex gap-2"><Link to="/admin" className="btn-secondary">Back to Admin</Link><button type="button" className="btn-secondary flex items-center gap-2" onClick={load}><RefreshCw size={14} /> Refresh</button></div></div>

    <div className="grid md:grid-cols-4 gap-4"><Stat label="Print methods" value={methods.length} icon={<Factory />} /><Stat label="Profiles" value={profileCount} icon={<Settings />} /><Stat label="Stock colours" value={colours.length} icon={<Palette />} /><Stat label="Restricted" value={restrictedCount} icon={<ShieldCheck />} /></div>
    <MigrationPanel status={migrationStatus} onReload={load} />

    <nav className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-3" aria-label="Manufacturing rules sections">{[["methods", "Print Methods"], ["colours", "Stocked Colours"], ["settings", "Global Settings"]].map(([key, label]) => <NavLink key={key} to={`/admin/manufacturing-rules/${key}`} className={activeSection === key ? "btn-primary" : "btn-secondary"}>{label}</NavLink>)}</nav>

    {activeSection === "methods" && <ManufacturingProfilesPanel methods={methods} selectedKey={selectedKey} onSelect={setSelectedKey} colours={colours} onPatchMethod={patchMethod} onPatchProfile={patchProfile} onDefault={setDefaultProfile} onDuplicate={duplicateProfile} onArchive={(methodKey, index) => patchProfile(methodKey, index, { status: "archived", is_default: false })} onAdd={addProfile} onSave={saveMethod} saving={saving} />}

    {activeSection === "colours" && <div className="space-y-4"><div className="card space-y-4"><div><p className="overline mb-1">Create colour</p><h2 className="font-display text-3xl uppercase">Add stocked colour</h2></div><div className="grid md:grid-cols-[1fr,150px,1fr,120px] gap-4 items-end"><Field label="Name"><input className="input-base" value={newColour.name} onChange={(event) => setNewColour((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Hex"><input className="input-base" type="color" value={newColour.hex} onChange={(event) => setNewColour((current) => ({ ...current, hex: event.target.value }))} /></Field><Field label="Applies to methods"><textarea className="input-base min-h-[60px]" value={newColour.appliesToMethodsText} onChange={(event) => setNewColour((current) => ({ ...current, appliesToMethodsText: event.target.value }))} /></Field><button type="button" className="btn-primary h-12" disabled={saving} onClick={createColour}>Create</button></div></div>
      <div className="grid lg:grid-cols-2 gap-4">{colours.map((colour) => { const draft = colourDrafts[colour.id] || colourDraft(colour); return <div key={colour.id} className={`card space-y-4 ${draft.active === false ? "opacity-60" : ""}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="w-10 h-10 border border-black/40" style={{ background: draft.hex }} /><div><p className="overline">{colour.id}</p><h3 className="font-display text-2xl uppercase">{draft.name}</h3></div></div><button type="button" className="btn-secondary flex items-center gap-2" disabled={saving} onClick={() => saveColour(colour.id)}><Save size={14} /> Save</button></div><div className="grid md:grid-cols-2 gap-4"><Field label="Name"><input className="input-base" value={draft.name || ""} onChange={(event) => patchColour(colour.id, { name: event.target.value })} /></Field><Field label="Hex"><input className="input-base" type="color" value={draft.hex || "#000000"} onChange={(event) => patchColour(colour.id, { hex: event.target.value })} /></Field><NumericField label="Sort order" value={draft.sort_order} onChange={(value) => patchColour(colour.id, { sort_order: value })} /><div className="pt-7"><Toggle label="Colour active" checked={draft.active !== false} onChange={(active) => patchColour(colour.id, { active })} /></div><Field label="Aliases"><textarea className="input-base min-h-[72px]" value={draft.aliasesText || ""} onChange={(event) => patchColour(colour.id, { aliasesText: event.target.value })} /></Field><Field label="Applies to methods"><textarea className="input-base min-h-[72px]" value={draft.appliesToMethodsText || ""} onChange={(event) => patchColour(colour.id, { appliesToMethodsText: event.target.value })} /></Field></div></div>; })}</div>
    </div>}

    {activeSection === "settings" && <div className="card space-y-5">{!settings ? <p className="text-sm text-[var(--ff-muted-text)]">Global settings require super-admin access.</p> : <><div className="flex items-start justify-between gap-4"><div><p className="overline mb-1">Global costing</p><h2 className="font-display text-3xl uppercase">Platform controls</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">Print production pricing belongs to method profiles. These controls remain global.</p></div><button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={saveSettings}><Save size={14} /> Save settings</button></div><div className="grid md:grid-cols-3 gap-4"><NumericField label="Default packaging cost" value={settings.default_packaging_cost} onChange={(value) => setSettings((current) => ({ ...current, default_packaging_cost: value }))} /><NumericField label="Packaging creator markup %" value={settings.default_packaging_creator_markup_percent} onChange={(value) => setSettings((current) => ({ ...current, default_packaging_creator_markup_percent: value }))} /><NumericField label="Minimum creator profit" value={settings.minimum_creator_profit_required} onChange={(value) => setSettings((current) => ({ ...current, minimum_creator_profit_required: value }))} /></div><div className="grid md:grid-cols-3 gap-4"><Toggle label="Block publish on warnings" checked={settings.fail_publish_on_warnings} onChange={(value) => setSettings((current) => ({ ...current, fail_publish_on_warnings: value }))} /><Toggle label="Allow unknown material warning" checked={settings.allow_unknown_material_with_warning} onChange={(value) => setSettings((current) => ({ ...current, allow_unknown_material_with_warning: value }))} /><Toggle label="Allow unknown category warning" checked={settings.allow_unknown_category_with_warning} onChange={(value) => setSettings((current) => ({ ...current, allow_unknown_category_with_warning: value }))} /></div><Field label="Notes"><textarea className="input-base min-h-[90px]" value={settings.notes || ""} onChange={(event) => setSettings((current) => ({ ...current, notes: event.target.value }))} /></Field></>}</div>}
  </div></div>;
}
