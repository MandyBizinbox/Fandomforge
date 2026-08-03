import React, { useMemo } from "react";
import {
  PRINT_AREA_GEOMETRY_OPTIONS,
  safeArray,
  normalizeArea,
  STANDARD_PRINT_SIZE_PRESETS,
  getPrintSizePreset,
  printSizeLabel,
} from "./templateStudioUtils";

const AREA_KEY_OPTIONS = [
  { key: "front", label: "Front" },
  { key: "front_full", label: "Front Full" },
  { key: "back", label: "Back" },
  { key: "back_full", label: "Back Full" },
  { key: "sleeve", label: "Sleeve" },
  { key: "left_sleeve", label: "Left Sleeve" },
  { key: "right_sleeve", label: "Right Sleeve" },
  { key: "neck_label", label: "Neck Label" },
  { key: "pocket", label: "Pocket" },
  { key: "left_chest", label: "Left Chest" },
  { key: "right_chest", label: "Right Chest" },
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "full_wrap", label: "Full Wrap" },
  { key: "mug_wrap", label: "Mug Wrap" },
  { key: "other", label: "Other" },
];

const AREA_KEY_TAG_ALIASES = {
  front: ["front"],
  front_full: ["front"],
  left_chest: ["front", "pocket"],
  right_chest: ["front", "pocket"],
  back: ["back"],
  back_full: ["back"],
  sleeve: ["sleeve"],
  left_sleeve: ["sleeve"],
  right_sleeve: ["sleeve"],
  neck_label: ["neck_label"],
  pocket: ["pocket", "front"],
  top: ["top", "front"],
  bottom: ["bottom", "back"],
  full_wrap: ["full_wrap", "wrap"],
  mug_wrap: ["mug_wrap", "full_wrap", "wrap"],
  other: [],
};

function placementTagsForAreaKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return AREA_KEY_TAG_ALIASES[key] || (key ? [key] : []);
}

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function optionOutputLabel(option) {
  const parts = [];

  if (option?.standard_print_size_key) parts.push(option.standard_print_size_key);
  if (option?.width_mm && option?.height_mm) parts.push(`${option.width_mm}×${option.height_mm}mm`);
  if (option?.dpi) parts.push(`${option.dpi}DPI`);
  if (option?.fit_mode) parts.push(`${option.fit_mode} fit`);

  return parts.length ? parts.join(" · ") : "No production metadata";
}

function optionPlacementTags(option) {
  return safeArray(option?.print_positions)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function getOptionLabel(option) {
  return option?.display_name || option?.rule_name || [option?.print_method, option?.print_size].filter(Boolean).join(" · ") || option?.id || "Pricing rule";
}

function groupPrintOptionsByMethod(printOptions) {
  return safeArray(printOptions).reduce((groups, option) => {
    const key = option?.production_method_key || option?.manufacturing_method_id || option?.method_key || option?.print_method || "Other";
    const label = option?.production_method_display_name || option?.print_method || option?.method || key || "Other";

    if (!groups[key]) {
      groups[key] = {
        key,
        label,
        options: [],
      };
    }

    groups[key].options.push(option);
    return groups;
  }, {});
}

function optionCostSummary(option) {
  const type = option?.calculation_type || "fixed";
  if (type === "area_fixed_rate") {
    return `area_fixed_rate · ${money(option.cost_per_cm2)}/cm² · Minimum ${money(option.minimum_print_cost)} · Tags: ${optionPlacementTags(option).join(", ") || "none"}`;
  }
  if (type === "area_from_sheet") {
    const sheetWidth = Number(option.sheet_width_mm || 0);
    const sheetHeight = Number(option.sheet_height_mm || 0);
    const sheetArea = sheetWidth && sheetHeight ? (sheetWidth / 10) * (sheetHeight / 10) : 0;
    const derivedRate = sheetArea ? Number(option.sheet_cost || 0) / sheetArea : Number(option.cost_per_cm2 || 0);
    return `area_from_sheet · ${money(derivedRate)}/cm² · Sheet ${sheetWidth}×${sheetHeight}mm @ ${money(option.sheet_cost)} · Minimum ${money(option.minimum_print_cost)} · Tags: ${optionPlacementTags(option).join(", ") || "none"}`;
  }
  if (type === "sheet" || type === "full_sheet") {
    return `${type} · Sheet cost ${money(option.sheet_cost || option.print_cost_max || option.platform_print_cost)} · Tags: ${optionPlacementTags(option).join(", ") || "none"}`;
  }
  return `fixed · Platform print cost ${money(option.platform_print_cost || option.print_cost_max)} · Tags: ${optionPlacementTags(option).join(", ") || "none"}`;
}

function polygonPointsText(points) {
  try {
    return JSON.stringify(safeArray(points));
  } catch {
    return "[]";
  }
}

export default function PrintAreaInspector({ selectedArea, printOptions, onChange }) {
  const activeOptionIds = safeArray(selectedArea?.allowed_print_option_ids);
  const areaKey = selectedArea?.area_key || selectedArea?.view_key || selectedArea?.screen_view || "";
  const geometryType = selectedArea?.geometry_type || selectedArea?.shape_type || "rectangle";

  const groupedOptions = useMemo(() => {
    const groups = groupPrintOptionsByMethod(printOptions);
    return Object.values(groups).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [printOptions]);

  if (!selectedArea) {
    return (
      <div className="studio-panel h-full">
        <div className="overline mb-2">Inspector</div>
        <div className="text-zinc-500 text-sm">
          Select a print area to edit its placement, geometry, dimensions and allowed print options.
        </div>
      </div>
    );
  }

  const update = (patch) => onChange(normalizeArea({ ...selectedArea, ...patch }));

  const applyStandardPrintSize = (sizeKey) => {
    const preset = getPrintSizePreset(sizeKey);
    update({
      standard_print_size_key: preset.value,
      print_size: preset.value,
      width_mm: preset.width_mm || null,
      height_mm: preset.height_mm || null,
    });
  };

  const toggleOption = (optionId) => {
    const current = safeArray(selectedArea.allowed_print_option_ids);
    update({
      allowed_print_option_ids: current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    });
  };

  const setAllowedOptionIds = (ids) => {
    update({ allowed_print_option_ids: Array.from(new Set(safeArray(ids))) });
  };

  const allowMatchingPlacementTags = () => {
    const key = (selectedArea.area_key || selectedArea.view_key || selectedArea.screen_view || "").toLowerCase();
    const acceptedTags = placementTagsForAreaKey(key);

    if (!acceptedTags.length) return;

    const matching = safeArray(printOptions)
      .filter((option) => {
        const tags = optionPlacementTags(option);
        return acceptedTags.some((tag) => tags.includes(tag));
      })
      .map((option) => option.id)
      .filter(Boolean);

    setAllowedOptionIds(matching);
  };

  const allowAllActive = () => {
    setAllowedOptionIds(
      safeArray(printOptions)
        .filter((option) => (option.status || "active") === "active")
        .map((option) => option.id)
        .filter(Boolean)
    );
  };

  const clearAll = () => setAllowedOptionIds([]);

  const applyAreaKey = (nextAreaKey) => {
    const selected = AREA_KEY_OPTIONS.find((item) => item.key === nextAreaKey);
    update({
      area_key: nextAreaKey,
      view_key: selectedArea.view_key || nextAreaKey,
      name: selectedArea.name || selected?.label || nextAreaKey,
    });
  };

  const makeRound = () => {
    const widthPct = Number(selectedArea.width || selectedArea.width_pct || 30);
    const widthMm = Number(selectedArea.width_mm || selectedArea.height_mm || 0) || null;
    update({
      geometry_type: "circle",
      shape_type: "circle",
      width: widthPct,
      width_pct: widthPct,
      height: widthPct,
      height_pct: widthPct,
      width_mm: widthMm,
      height_mm: widthMm,
    });
  };

  const updatePolygonPoints = (value) => {
    try {
      const parsed = JSON.parse(value || "[]");
      if (Array.isArray(parsed)) update({ polygon_points: parsed });
    } catch {
      // Keep the previous valid polygon until the JSON becomes valid.
    }
  };

  return (
    <div className="studio-panel h-full overflow-y-auto">
      <div className="studio-panel-header">
        <div>
          <div className="overline mb-1">Inspector</div>
          <h2 className="font-display text-2xl uppercase">Print Area</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Area geometry clips creator artwork and defines the production boundary. Pricing rules decide how that boundary is costed.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <div>
            <div className="overline mb-2">Area identity</div>
            <div className="grid gap-3">
              <label>
                <span className="label">Area name</span>
                <input
                  className="input-base"
                  value={selectedArea.name || ""}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="Sleeve, Front, Back, Coaster Top"
                />
              </label>

              <label>
                <span className="label">Area key</span>
                <select className="input-base" value={areaKey} onChange={(e) => applyAreaKey(e.target.value)}>
                  <option value="">Select area key</option>
                  {AREA_KEY_OPTIONS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="label">Printable shape</span>
                <select
                  className="input-base"
                  value={geometryType}
                  onChange={(e) => update({ geometry_type: e.target.value, shape_type: e.target.value })}
                >
                  {PRINT_AREA_GEOMETRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              {geometryType === "circle" && (
                <button type="button" className="btn-secondary text-xs justify-center" onClick={makeRound}>
                  Match width and height
                </button>
              )}

              {geometryType === "polygon" && (
                <label>
                  <span className="label">Polygon points (JSON, percentages)</span>
                  <textarea
                    className="input-base font-mono text-xs"
                    rows={4}
                    defaultValue={polygonPointsText(selectedArea.polygon_points)}
                    onBlur={(e) => updatePolygonPoints(e.target.value)}
                    placeholder='[{"x_pct":0,"y_pct":0},{"x_pct":100,"y_pct":0},{"x_pct":50,"y_pct":100}]'
                  />
                </label>
              )}

              {geometryType === "mask" && (
                <label>
                  <span className="label">Transparent SVG/PNG mask URL</span>
                  <input
                    className="input-base"
                    value={selectedArea.mask_url || selectedArea.clip_mask_url || ""}
                    onChange={(e) => update({ mask_url: e.target.value, clip_mask_url: e.target.value })}
                    placeholder="/uploads/print-area-masks/product-shape.svg"
                  />
                </label>
              )}

              <label className="flex items-center gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={Boolean(selectedArea.required)}
                  onChange={(e) => update({ required: e.target.checked })}
                />
                Required print area
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <div>
            <div className="overline mb-2">Mockup position</div>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label">X %</span><input className="input-base" type="number" step="0.1" value={selectedArea.x} onChange={(e) => { const value = Number(e.target.value || 0); update({ x: value, x_pct: value }); }} /></label>
              <label><span className="label">Y %</span><input className="input-base" type="number" step="0.1" value={selectedArea.y} onChange={(e) => { const value = Number(e.target.value || 0); update({ y: value, y_pct: value }); }} /></label>
              <label><span className="label">Width %</span><input className="input-base" type="number" step="0.1" value={selectedArea.width} onChange={(e) => { const value = Number(e.target.value || 1); update({ width: value, width_pct: value }); }} /></label>
              <label><span className="label">Height %</span><input className="input-base" type="number" step="0.1" value={selectedArea.height} onChange={(e) => { const value = Number(e.target.value || 1); update({ height: value, height_pct: value }); }} /></label>
            </div>

            <div className="border-t border-white/10 pt-3">
              <div className="overline mb-2">Quick move / resize</div>
              <div className="grid grid-cols-3 gap-2">
                <div />
                <button type="button" className="btn-secondary text-xs" onClick={() => { const value = Number(selectedArea.y || selectedArea.y_pct || 0) - 1; update({ y: value, y_pct: value }); }}>Up</button>
                <div />
                <button type="button" className="btn-secondary text-xs" onClick={() => { const value = Number(selectedArea.x || selectedArea.x_pct || 0) - 1; update({ x: value, x_pct: value }); }}>Left</button>
                <button type="button" className="btn-secondary text-xs" onClick={() => { const width = Number(selectedArea.width || selectedArea.width_pct || 30); const height = Number(selectedArea.height || selectedArea.height_pct || 30); const x = Math.max(0, (100 - width) / 2); const y = Math.max(0, (100 - height) / 2); update({ x, x_pct: x, y, y_pct: y }); }}>Center</button>
                <button type="button" className="btn-secondary text-xs" onClick={() => { const value = Number(selectedArea.x || selectedArea.x_pct || 0) + 1; update({ x: value, x_pct: value }); }}>Right</button>
                <div />
                <button type="button" className="btn-secondary text-xs" onClick={() => { const value = Number(selectedArea.y || selectedArea.y_pct || 0) + 1; update({ y: value, y_pct: value }); }}>Down</button>
                <div />
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button type="button" className="btn-secondary text-xs" onClick={() => update({ x: 10, x_pct: 10, y: 10, y_pct: 10, width: 80, width_pct: 80, height: 80, height_pct: 80 })}>Reset box</button>
                <button type="button" className="btn-secondary text-xs" onClick={() => update({ x: 0, x_pct: 0, width: 100, width_pct: 100 })}>Full width</button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <div>
            <div className="overline mb-2">Production boundary</div>
            <p className="text-xs text-zinc-500 mb-3">Real-world output size, bleed and safe zone. This is separate from the mockup position above.</p>

            <div className="grid gap-3">
              <label>
                <span className="label">Standard print size</span>
                <select className="input-base" value={selectedArea.standard_print_size_key || selectedArea.print_size || "custom"} onChange={(e) => applyStandardPrintSize(e.target.value)}>
                  {STANDARD_PRINT_SIZE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                </select>
              </label>

              <div className="text-xs text-zinc-500">Output: {printSizeLabel(selectedArea.width_mm, selectedArea.height_mm, selectedArea.dpi || 300)}</div>

              <div className="grid grid-cols-2 gap-3">
                <label><span className="label">Width mm</span><input className="input-base" type="number" step="1" value={selectedArea.width_mm || ""} onChange={(e) => update({ standard_print_size_key: "custom", print_size: "custom", width_mm: e.target.value ? Number(e.target.value) : null })} /></label>
                <label><span className="label">Height mm</span><input className="input-base" type="number" step="1" value={selectedArea.height_mm || ""} onChange={(e) => update({ standard_print_size_key: "custom", print_size: "custom", height_mm: e.target.value ? Number(e.target.value) : null })} /></label>
                <label><span className="label">Bleed mm</span><input className="input-base" type="number" min="0" step="0.5" value={selectedArea.bleed_mm || 0} onChange={(e) => update({ bleed_mm: Number(e.target.value || 0) })} /></label>
                <label><span className="label">Safe margin mm</span><input className="input-base" type="number" min="0" step="0.5" value={selectedArea.safe_margin_mm || 0} onChange={(e) => update({ safe_margin_mm: Number(e.target.value || 0) })} /></label>
                <label><span className="label">Rotation °</span><input className="input-base" type="number" step="1" value={selectedArea.rotation_deg || 0} onChange={(e) => update({ rotation_deg: Number(e.target.value || 0) })} /></label>
                <label><span className="label">DPI</span><input className="input-base" type="number" step="1" value={selectedArea.dpi || 300} onChange={(e) => update({ dpi: Number(e.target.value || 300) })} /></label>
                <label><span className="label">Fit mode</span><select className="input-base" value={selectedArea.fit_mode || "contain"} onChange={(e) => update({ fit_mode: e.target.value })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="stretch">Stretch</option></select></label>
                <label><span className="label">Pricing area</span><select className="input-base" value={selectedArea.pricing_area_mode || "bounding_box"} onChange={(e) => update({ pricing_area_mode: e.target.value })}><option value="bounding_box">Bounding box</option><option value="shape">Actual circle/ellipse area</option></select></label>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="overline mb-2">Allowed manufacturing profiles</div>
              <p className="text-xs text-zinc-500">Selected: {activeOptionIds.length} / {safeArray(printOptions).length}</p>
            </div>
          </div>

          <div className="grid gap-2 mb-4">
            <button type="button" className="btn-secondary text-xs justify-center" onClick={allowMatchingPlacementTags} disabled={!areaKey}>Allow matching placement tags</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="border border-white/15 py-2 text-xs uppercase tracking-widest text-zinc-300 hover:text-white" onClick={allowAllActive}>Allow all active</button>
              <button type="button" className="border border-white/15 py-2 text-xs uppercase tracking-widest text-zinc-300 hover:text-[#FF3B30]" onClick={clearAll}>Clear all</button>
            </div>
          </div>

          <div className="grid gap-4 max-h-[420px] overflow-auto pr-1">
            {groupedOptions.map((group) => (
              <div key={group.key} className="border border-white/10 rounded-xl overflow-hidden">
                <div className="bg-black/30 px-3 py-2 font-bold text-xs uppercase tracking-widest text-zinc-300">{group.label}</div>
                <div className="divide-y divide-white/10">
                  {group.options.map((option) => {
                    const checked = activeOptionIds.includes(option.id);
                    return (
                      <label key={option.id} className={`flex gap-3 p-3 text-xs cursor-pointer transition ${checked ? "bg-[#FF3B30]/10" : "hover:bg-white/[0.03]"}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleOption(option.id)} className="mt-1" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-zinc-100">{getOptionLabel(option)}</span>
                          <span className="block text-zinc-500 mt-1">{optionOutputLabel(option)}</span>
                          <span className="block text-zinc-500 mt-1">{optionCostSummary(option)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {safeArray(printOptions).length === 0 && <div className="text-xs text-zinc-500">Seed or configure Manufacturing Rule pricing profiles first.</div>}
          </div>
        </div>

        <label>
          <span className="label">Notes</span>
          <textarea className="input-base" rows={3} value={selectedArea.notes || ""} onChange={(e) => update({ notes: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
