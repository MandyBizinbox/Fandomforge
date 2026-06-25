// Reusable component: lets creator/admin attach attributes to a product and auto-generates variation grid (cartesian product of "used_for_variation" attributes).
import React, { useEffect, useMemo } from "react";
import { http } from "../lib/api";
import { Trash2 } from "lucide-react";

function generateVariations(currentVariations, varAttrs) {
  // varAttrs: [{name, values: [...]}]
  if (varAttrs.length === 0) return [];
  let combos = [{}];
  for (const a of varAttrs) {
    const next = [];
    for (const c of combos) for (const v of a.values) next.push({ ...c, [a.name]: v });
    combos = next;
  }
  const keyOf = (av) => Object.entries(av || {}).sort().map(([k,v]) => `${k}=${v}`).join("|");
  return combos.map((av) => {
    const k = keyOf(av);
    const existing = currentVariations.find((cv) => keyOf(cv.attribute_values) === k);
    if (existing) return { ...existing, attribute_values: av };
    return {
      id: crypto.randomUUID(),
      attribute_values: av,
      sku: crypto.randomUUID().slice(0, 8).toUpperCase(),
      stock_status: "made_to_order",
      price_override: null,
      size: av.Size || av.size || "",
      color: av.Color || av.color || "",
    };
  });
}

export default function AttributeVariationEditor({ allAttributes, attributeIds, onAttributeIdsChange, variations, onVariationsChange, specAttributes, onSpecChange }) {
  const selectedAttrs = useMemo(
    () => allAttributes.filter((a) => attributeIds.includes(a.id)),
    [allAttributes, attributeIds]
  );
  const varAttrs = selectedAttrs.filter((a) => a.used_for_variation);
  const specAttrs = selectedAttrs.filter((a) => !a.used_for_variation);

  // Whenever the list of variation attributes changes, regenerate variations preserving overrides
  useEffect(() => {
    if (varAttrs.length === 0) {
      // No variation attributes — keep one default variation row so price/sku/stock are still editable
      if (variations.length === 0) {
        onVariationsChange([{
          id: crypto.randomUUID(), attribute_values: {},
          sku: crypto.randomUUID().slice(0, 8).toUpperCase(),
          stock_status: "made_to_order", price_override: null, size: "", color: "",
        }]);
      }
      return;
    }
    const next = generateVariations(variations, varAttrs.map((a) => ({ name: a.name, values: a.values })));
    // Avoid infinite loop: only update if changed in length or keys
    const same = next.length === variations.length && next.every((n, i) => JSON.stringify(n.attribute_values) === JSON.stringify(variations[i]?.attribute_values));
    if (!same) onVariationsChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(varAttrs.map((a) => ({ id: a.id, vals: a.values })))]);

  // Spec attrs: when toggled, default to all values selected
  useEffect(() => {
    const next = { ...specAttributes };
    let changed = false;
    for (const a of specAttrs) {
      if (!next[a.name]) { next[a.name] = a.values; changed = true; }
    }
    // Remove keys for unselected attrs
    for (const k of Object.keys(next)) {
      if (!specAttrs.find((a) => a.name === k)) { delete next[k]; changed = true; }
    }
    if (changed) onSpecChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specAttrs.map((a) => a.id).join(",")]);

  const toggleAttr = (id) => {
    onAttributeIdsChange(
      attributeIds.includes(id) ? attributeIds.filter((x) => x !== id) : [...attributeIds, id]
    );
  };

  const updateVariation = (idx, patch) => {
    onVariationsChange(variations.map((v, i) => i === idx ? { ...v, ...patch } : v));
  };

  return (
    <div className="space-y-4" data-testid="attribute-variation-editor">
      <div className="card">
        <div className="overline mb-3">Attributes</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {allAttributes.map((a) => {
            const sel = attributeIds.includes(a.id);
            return (
              <button key={a.id} type="button" onClick={() => toggleAttr(a.id)}
                className={`px-3 py-2 text-xs uppercase tracking-widest font-bold border ${sel ? 'bg-[#FF3B30] border-[#FF3B30] text-white' : 'border-white/20 text-zinc-300 hover:border-white'}`}
                data-testid={`attr-pick-${a.slug}`}>
                {a.name} {a.used_for_variation && <span className="opacity-60">·var</span>}
              </button>
            );
          })}
          {allAttributes.length === 0 && <div className="text-xs text-zinc-500">No attributes defined yet. Admin can create them in Attributes.</div>}
        </div>
        <div className="text-xs text-zinc-500">Click attributes to attach. Variation attributes (·var) generate SKU rows below; spec attributes appear as product specs.</div>
      </div>

      {specAttrs.length > 0 && (
        <div className="card" data-testid="spec-attributes-panel">
          <div className="overline mb-3">Spec attributes (display only)</div>
          {specAttrs.map((a) => (
            <div key={a.id} className="mb-3">
              <div className="text-sm font-bold mb-2">{a.name}</div>
              <div className="flex flex-wrap gap-2">
                {a.values.map((v) => {
                  const selected = (specAttributes[a.name] || []).includes(v);
                  return (
                    <button key={v} type="button"
                      onClick={() => {
                        const cur = specAttributes[a.name] || [];
                        const next = selected ? cur.filter((x) => x !== v) : [...cur, v];
                        onSpecChange({ ...specAttributes, [a.name]: next });
                      }}
                      className={`px-2 py-1 text-xs border ${selected ? 'bg-white text-black border-white' : 'border-white/20 text-zinc-400'}`}
                      data-testid={`spec-${a.slug}-${v}`}>
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="overline mb-3">Variations ({variations.length})</div>
        {variations.length === 0 ? (
          <div className="text-xs text-zinc-500">Attach a "variation" attribute (e.g., Size, Color) above to generate SKU rows.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-brutal text-sm">
              <thead>
                <tr>
                  {varAttrs.map((a) => <th key={a.id}>{a.name}</th>)}
                  {varAttrs.length === 0 && <th>Default</th>}
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Price override</th>
                </tr>
              </thead>
              <tbody>
                {variations.map((v, idx) => (
                  <tr key={v.id} data-testid={`var-row-${idx}`}>
                    {varAttrs.length === 0 ? (
                      <td className="text-zinc-500">—</td>
                    ) : (
                      varAttrs.map((a) => (
                        <td key={a.id} className="font-mono text-xs">{v.attribute_values?.[a.name] || "—"}</td>
                      ))
                    )}
                    <td>
                      <input className="input-base text-xs py-1 font-mono w-32" value={v.sku} onChange={(e) => updateVariation(idx, { sku: e.target.value })} data-testid={`var-sku-${idx}`} />
                    </td>
                    <td>
                      <select className="input-base text-xs py-1" value={v.stock_status} onChange={(e) => updateVariation(idx, { stock_status: e.target.value })} data-testid={`var-stock-${idx}`}>
                        <option value="made_to_order">MTO</option>
                        <option value="in_stock">In stock</option>
                        <option value="out_of_stock">Out</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="input-base text-xs py-1 w-24"
                        type="number" step="0.01"
                        placeholder="inherit"
                        value={v.price_override ?? ""}
                        onChange={(e) => updateVariation(idx, { price_override: e.target.value === "" ? null : Number(e.target.value) })}
                        data-testid={`var-price-${idx}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
