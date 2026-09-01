import React from "react";
import { Archive, ChevronDown, ChevronUp, Copy, Plus, Save, Star } from "lucide-react";
import {
  CALCULATION_TYPES,
  calculationFieldGroups,
  derivedSheetRate,
  profileColourIds,
  profileColourMode,
  profileName,
  profileSummary,
  safeArray,
} from "../../lib/unifiedManufacturingCosting";
import { Field, NumericField, Toggle } from "./manufacturingRulesShared";

function ProfileColourSelector({ profile, method, colours, onPatch }) {
  const stockedMethod = ["htv", "adhesive_vinyl"].includes(method.method_key)
    && method.colourMode === "stocked_library";
  if (!stockedMethod) return null;

  const methodColourIds = new Set(safeArray(method.selectedColourIds));
  const availableColours = safeArray(colours).filter(
    (colour) => colour.active !== false && methodColourIds.has(colour.id)
  );
  const restricted = profileColourMode(profile) === "restricted";
  const selectedIds = new Set(profileColourIds(profile));

  function setInherited(inherit) {
    if (inherit) {
      onPatch({
        colour_selection_mode: "inherit_method",
        color_selection_mode: "inherit_method",
        supported_colour_ids: [],
        available_colour_ids: [],
      });
      return;
    }
    const ids = availableColours.map((colour) => colour.id);
    onPatch({
      colour_selection_mode: "restricted",
      color_selection_mode: "restricted",
      supported_colour_ids: ids,
      available_colour_ids: ids,
    });
  }

  function toggleColour(colourId, checked) {
    const ids = checked
      ? [...selectedIds, colourId]
      : [...selectedIds].filter((id) => id !== colourId);
    onPatch({
      colour_selection_mode: "restricted",
      color_selection_mode: "restricted",
      supported_colour_ids: ids,
      available_colour_ids: ids,
    });
  }

  return <div className="ff-admin-subpanel space-y-3">
    <div>
      <p className="overline mb-1">Available colours</p>
      <h4 className="font-display text-2xl uppercase">Profile stocked-colour range</h4>
      <p className="text-xs text-[var(--ff-muted-text)] mt-1">
        This profile may inherit every colour enabled for {method.display_name}, or expose only a selected subset in Creator Studio.
      </p>
    </div>
    <Toggle
      label={`Use all ${method.display_name} colours`}
      checked={!restricted}
      onChange={setInherited}
    />
    {restricted && <>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 max-h-[240px] overflow-auto border border-[var(--ff-card-border)] p-3">
        {availableColours.map((colour) => <label key={colour.id} className="flex items-center gap-2 border border-[var(--ff-card-border)] p-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selectedIds.has(colour.id)}
            onChange={(event) => toggleColour(colour.id, event.target.checked)}
          />
          <span className="w-5 h-5 border border-black/40 shrink-0" style={{ background: colour.hex || "transparent" }} />
          <span>{colour.name}</span>
        </label>)}
        {!availableColours.length && <div className="sm:col-span-2 xl:col-span-4 text-xs ff-admin-danger-text">
          No method colours are enabled. Configure the method colour pool below first.
        </div>}
      </div>
      {selectedIds.size === 0 && <p className="text-xs ff-admin-danger-text">
        Select at least one colour before saving this restricted profile.
      </p>}
    </>}
  </div>;
}

function ProfileEditor({ profile, method, colours, onPatch, onDefault, onDuplicate, onArchive }) {
  const groups = calculationFieldGroups(profile.calculation_type);
  const show = (field) => [...groups.primary, ...groups.sheet, ...groups.area].includes(field);
  const advancedOpen = Boolean(profile._advancedOpen);
  const sheetRate = derivedSheetRate(profile);

  return <div className={`ff-admin-subpanel space-y-4 ${profile.is_default ? "border-[var(--ff-primary)]" : ""} ${profile.status === "archived" ? "opacity-60" : ""}`}>
    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {profile.is_default && <span className="text-[10px] uppercase tracking-widest border border-[var(--ff-primary)] px-2 py-1">Default</span>}
          <span className="text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)]">{profile.status}</span>
          {safeArray(profile.legacy_print_option_ids).length > 0 && <span className="text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)]">{profile.legacy_print_option_ids.length} aliases</span>}
        </div>
        <input className="input-base font-display text-2xl uppercase" value={profile.display_name || profileName(profile)} onChange={(event) => onPatch({ display_name: event.target.value, profile_name: event.target.value })} />
        <p className="text-xs text-[var(--ff-muted-text)] mt-2">{profileSummary(profile)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!profile.is_default && profile.status !== "archived" && <button type="button" className="btn-secondary flex items-center gap-2" onClick={onDefault}><Star size={14} /> Set default</button>}
        <button type="button" className="btn-secondary flex items-center gap-2" onClick={onDuplicate}><Copy size={14} /> Duplicate</button>
        {profile.status !== "archived" && <button type="button" className="btn-secondary flex items-center gap-2" onClick={onArchive}><Archive size={14} /> Archive</button>}
      </div>
    </div>

    <div className="grid md:grid-cols-4 gap-4">
      <Field label="Calculation type"><select className="input-base" value={profile.calculation_type || "area_fixed_rate"} onChange={(event) => onPatch({ calculation_type: event.target.value })}>{CALCULATION_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
      {show("print_cost_max") && <NumericField label="Fixed / max cost" value={profile.print_cost_max} onChange={(value) => onPatch({ print_cost_max: value, platform_print_cost: value })} />}
      {show("creator_print_price") && <NumericField label="Creator fixed price" value={profile.creator_print_price} onChange={(value) => onPatch({ creator_print_price: value })} />}
      {show("cost_per_cm2") && <NumericField label="Cost per cm²" step="0.000001" value={profile.calculation_type === "area_from_sheet" && sheetRate ? sheetRate : profile.cost_per_cm2} readOnly={profile.calculation_type === "area_from_sheet" && sheetRate > 0} onChange={(value) => onPatch({ cost_per_cm2: value })} />}
      {show("minimum_area_cm2") && <NumericField label="Minimum area cm²" value={profile.minimum_area_cm2} onChange={(value) => onPatch({ minimum_area_cm2: value })} />}
      {show("application_cost") && <NumericField label="Application cost" value={profile.application_cost} onChange={(value) => onPatch({ application_cost: value })} />}
      {show("sheet_width_mm") && <NumericField label="Sheet width mm" value={profile.sheet_width_mm} onChange={(value) => onPatch({ sheet_width_mm: value })} />}
      {show("sheet_height_mm") && <NumericField label="Sheet height mm" value={profile.sheet_height_mm} onChange={(value) => onPatch({ sheet_height_mm: value })} />}
      {show("sheet_cost") && <NumericField label="Sheet cost" value={profile.sheet_cost} onChange={(value) => onPatch({ sheet_cost: value })} />}
    </div>

    <ProfileColourSelector profile={profile} method={method} colours={colours} onPatch={onPatch} />

    <button type="button" className="text-xs uppercase tracking-widest flex items-center gap-2" onClick={() => onPatch({ _advancedOpen: !advancedOpen })}>{advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Advanced pricing and compatibility</button>
    {advancedOpen && <div className="border-t border-[var(--ff-card-border)] pt-4 space-y-4">
      <div className="grid md:grid-cols-4 gap-4">
        <NumericField label="Waste %" value={profile.waste_percentage} onChange={(value) => onPatch({ waste_percentage: value })} />
        <NumericField label="Markup %" value={profile.markup_percentage} onChange={(value) => onPatch({ markup_percentage: value })} />
        <NumericField label="Minimum print cost" hint="Exceptional monetary floor. The normal outsourced model uses minimum area instead." value={profile.minimum_print_cost} onChange={(value) => onPatch({ minimum_print_cost: value })} />
        <Field label="Status"><select className="input-base" value={profile.status || "active"} onChange={(event) => onPatch({ status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="draft">Draft</option><option value="archived">Archived</option></select></Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Markup type"><select className="input-base" value={profile.platform_print_markup_type || "manual"} onChange={(event) => onPatch({ platform_print_markup_type: event.target.value })}><option value="manual">Manual</option><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></Field>
        <NumericField label="Markup value" value={profile.platform_print_markup_value} onChange={(value) => onPatch({ platform_print_markup_value: value })} />
        <Field label="Legacy aliases" hint="Compatibility only. One per line."><textarea className="input-base min-h-[90px]" value={safeArray(profile.legacy_print_option_ids).join("\n")} onChange={(event) => onPatch({ legacy_print_option_ids: event.target.value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean) })} /></Field>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Placement tags"><textarea className="input-base min-h-[90px]" value={safeArray(profile.print_positions || profile.placement_tags).join("\n")} onChange={(event) => onPatch({ print_positions: event.target.value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean), placement_tags: event.target.value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean) })} /></Field>
        <Field label="Pricing notes"><textarea className="input-base min-h-[90px]" value={profile.pricing_notes || ""} onChange={(event) => onPatch({ pricing_notes: event.target.value })} /></Field>
      </div>
    </div>}
  </div>;
}

function MethodBehaviour({ method, colours, onPatch }) {
  const expanded = Boolean(method._behaviourOpen);
  return <div className="ff-admin-card">
    <button type="button" className="w-full flex items-center justify-between" onClick={() => onPatch({ _behaviourOpen: !expanded })}>
      <div className="text-left"><p className="overline mb-1">Production behaviour</p><h3 className="font-display text-2xl uppercase">Method constraints</h3></div>
      {expanded ? <ChevronUp /> : <ChevronDown />}
    </button>
    {expanded && <div className="mt-5 space-y-5">
      <div className="grid md:grid-cols-3 gap-4"><Toggle label="Method active" checked={method.active !== false} onChange={(value) => onPatch({ active: value })} /><Toggle label="Transparent required" checked={method.transparent_background_required} onChange={(value) => onPatch({ transparent_background_required: value })} /><Toggle label="Mirror required" checked={method.mirror_artwork_required} onChange={(value) => onPatch({ mirror_artwork_required: value })} /><Toggle label="Gang sheet capable" checked={method.gang_sheet_capable} onChange={(value) => onPatch({ gang_sheet_capable: value })} /><Toggle label="Each colour creates layer" checked={method.everyColourCreatesLayer} onChange={(value) => onPatch({ everyColourCreatesLayer: value })} /></div>
      <div className="grid md:grid-cols-3 gap-4"><Field label="Display name"><input className="input-base" value={method.display_name || ""} onChange={(event) => onPatch({ display_name: event.target.value })} /></Field><NumericField label="Lead time days" value={method.default_production_lead_time_days} onChange={(value) => onPatch({ default_production_lead_time_days: value })} /><NumericField label="Minimum DPI" value={method.minimum_resolution_dpi} onChange={(value) => onPatch({ minimum_resolution_dpi: value })} /></div>
      <Field label="Description"><textarea className="input-base min-h-[90px]" value={method.description || ""} onChange={(event) => onPatch({ description: event.target.value })} /></Field>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Supported categories"><textarea className="input-base min-h-[100px]" value={method.categoriesText || ""} onChange={(event) => onPatch({ categoriesText: event.target.value })} /></Field><Field label="Supported materials"><textarea className="input-base min-h-[100px]" value={method.materialsText || ""} onChange={(event) => onPatch({ materialsText: event.target.value })} /></Field><Field label="Supported artwork types"><textarea className="input-base min-h-[90px]" value={method.artworkTypesText || ""} onChange={(event) => onPatch({ artworkTypesText: event.target.value })} /></Field><Field label="Method colour pool" hint="Profiles may inherit this full pool or select a smaller subset."><div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-auto border border-[var(--ff-card-border)] p-3">{colours.map((colour) => <Toggle key={colour.id} label={colour.name} checked={safeArray(method.selectedColourIds).includes(colour.id)} onChange={(checked) => onPatch({ selectedColourIds: checked ? [...safeArray(method.selectedColourIds), colour.id] : safeArray(method.selectedColourIds).filter((id) => id !== colour.id) })} />)}</div></Field></div>
    </div>}
  </div>;
}

export default function ManufacturingProfilesPanel({ methods, selectedKey, onSelect, colours, onPatchMethod, onPatchProfile, onDefault, onDuplicate, onArchive, onAdd, onSave, saving }) {
  const selected = methods.find((method) => method.method_key === selectedKey) || methods[0];
  return <div className="grid lg:grid-cols-[280px,1fr] gap-4">
    <div className="ff-admin-card space-y-2"><p className="overline mb-3">Production methods</p>{methods.map((method) => <button type="button" key={method.method_key} onClick={() => onSelect(method.method_key)} className={`ff-admin-method-link w-full p-3 text-left ${selected?.method_key === method.method_key ? "is-active" : ""}`}><div className="font-display text-xl uppercase">{method.display_name || method.method_key}</div><div className="text-xs uppercase tracking-widest mt-1">{safeArray(method.profiles).length} profiles</div></button>)}</div>
    {selected && <div className="space-y-4">
      <div className="ff-admin-card"><div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4"><div><p className="overline mb-2">Selected method</p><h2 className="font-display text-4xl uppercase">{selected.display_name}</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">One canonical profile collection. The default is used unless a product or print area selects a specialist profile.</p></div><button type="button" onClick={() => onSave(selected.method_key)} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15} /> Save method & profiles</button></div></div>
      <div className="ff-admin-card space-y-4"><div className="flex items-center justify-between"><div><p className="overline mb-1">Costing profiles</p><h3 className="font-display text-3xl uppercase">Per-profile pricing</h3></div><button type="button" onClick={() => onAdd(selected.method_key)} className="btn-secondary flex items-center gap-2"><Plus size={14} /> Add profile</button></div>{safeArray(selected.profiles).map((profile, index) => <ProfileEditor key={profile.id || index} profile={profile} method={selected} colours={colours} onPatch={(updates) => onPatchProfile(selected.method_key, index, updates)} onDefault={() => onDefault(selected.method_key, index)} onDuplicate={() => onDuplicate(selected.method_key, index)} onArchive={() => onArchive(selected.method_key, index)} />)}{!safeArray(selected.profiles).length && <div className="border border-dashed border-[var(--ff-card-border)] p-5 text-sm text-[var(--ff-muted-text)]">No profiles yet. Add the first costing profile.</div>}</div>
      <MethodBehaviour method={selected} colours={colours} onPatch={(updates) => onPatchMethod(selected.method_key, updates)} />
    </div>}
  </div>;
}