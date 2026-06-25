import React, { useMemo, useState } from "react";
import { CheckSquare, Square } from "lucide-react";
import {
  asArray,
  getVariationCost,
  getVariationMatrix,
  getVariationSize,
  money,
} from "./productBuilderUtils";

export default function ProductVariationMatrix({ template, selectedIds, onChange }) {
  const [filter, setFilter] = useState("");

  const variations = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const source = asArray(template?.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived");
    if (!q) return source;
    return source.filter((variation) => JSON.stringify(variation.attributes || variation.attribute_values || {}).toLowerCase().includes(q));
  }, [template, filter]);

  const matrix = useMemo(() => getVariationMatrix(variations), [variations]);
  const selected = useMemo(() => new Set(asArray(selectedIds)), [selectedIds]);

  const setSelected = (nextSet) => onChange([...nextSet]);

  const toggleOne = (variationId) => {
    const next = new Set(selected);
    if (next.has(variationId)) next.delete(variationId);
    else next.add(variationId);
    setSelected(next);
  };

  const toggleRow = (row) => {
    const ids = row.items.map((variation) => variation.id);
    const allSelected = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => {
      if (allSelected) next.delete(id);
      else next.add(id);
    });
    setSelected(next);
  };

  const toggleColumn = (size) => {
    const ids = variations.filter((variation) => getVariationSize(variation) === size).map((variation) => variation.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => {
      if (allSelected) next.delete(id);
      else next.add(id);
    });
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(variations.map((variation) => variation.id)));
  const clearAll = () => setSelected(new Set());

  return (
    <div className="space-y-4 product-variation-matrix-shell" data-testid="product-variation-matrix">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <div className="overline mb-1">Variation Matrix</div>
          <p className="text-sm text-zinc-500">
            Select the template variations this sellable product will offer. Artwork groups are configured in the next step.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={selectAll}>Select all</button>
          <button type="button" className="btn-secondary" onClick={clearAll}>Clear</button>
        </div>
      </div>

      <input
        className="input-base max-w-xl"
        placeholder="Filter colours or sizes"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="product-variation-scroll rounded-xl border border-white/10 overflow-auto bg-black/30">
        <table className="w-full text-sm product-variation-table">
          <thead>
            <tr className="bg-white/[0.04] border-b border-white/10">
              <th className="text-left p-3 sticky left-0 z-10 bg-[#111] min-w-[180px]">Colour</th>
              {matrix.sizes.map((size) => (
                <th key={size} className="p-3 min-w-[110px] text-center">
                  <button type="button" className="text-xs uppercase tracking-widest text-zinc-300 hover:text-[#FF3B30]" onClick={() => toggleColumn(size)}>
                    {size}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => {
              const rowIds = row.items.map((variation) => variation.id);
              const selectedCount = rowIds.filter((id) => selected.has(id)).length;
              return (
                <tr key={row.colour} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 sticky left-0 z-10 bg-[#0f0f0f] align-top">
                    <button type="button" className="flex items-start gap-3 text-left w-full" onClick={() => toggleRow(row)}>
                      <span className="mt-1 text-[#FF3B30]">
                        {selectedCount === rowIds.length && rowIds.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                      </span>
                      <span>
                        <span className="font-bold text-white block">{row.colour}</span>
                        <span className="text-xs text-zinc-500">{selectedCount}/{rowIds.length} selected</span>
                      </span>
                    </button>
                  </td>
                  {matrix.sizes.map((size) => {
                    const variation = row.items.find((item) => getVariationSize(item) === size);
                    if (!variation) {
                      return <td key={size} className="p-3 text-center text-zinc-700">—</td>;
                    }
                    const active = selected.has(variation.id);
                    return (
                      <td key={variation.id} className="p-2 text-center align-top">
                        <button
                          type="button"
                          onClick={() => toggleOne(variation.id)}
                          className={`w-full rounded-lg border p-2 transition ${active ? "border-[#FF3B30] bg-[#FF3B30]/15" : "border-white/10 bg-black/30 hover:border-white/30"}`}
                        >
                          <span className={`block text-xs uppercase tracking-widest ${active ? "text-white" : "text-zinc-500"}`}>{active ? "On" : "Off"}</span>
                          <span className="block text-[11px] text-zinc-500 mt-1">{money(getVariationCost(variation, template))}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {variations.length === 0 && (
          <div className="p-8 text-center text-zinc-500">This template has no enabled variations yet.</div>
        )}
      </div>
    </div>
  );
}
