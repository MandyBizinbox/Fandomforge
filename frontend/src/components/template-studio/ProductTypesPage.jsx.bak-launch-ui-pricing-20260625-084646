import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { safeArray } from "./templateStudioUtils";

function countBaseViews(row) {
  const baseViews = safeArray(row.base_views);
  return baseViews.length || safeArray(row.mockup_screens).length;
}

function countVariationAxes(row) {
  return safeArray(row.default_variation_axes).length;
}

function blueprintFlags(row) {
  return [
    row.supports_printing === false ? null : "Printing",
    row.supports_mockups === false ? null : "Mockups",
    row.requires_template === false ? "Manual allowed" : "Template required",
    row.supports_neck_label ? "Neck label" : null,
    row.supports_sleeves ? "Sleeves" : null,
    row.supports_wraparound ? "Wraparound" : null,
  ].filter(Boolean);
}

export default function ProductTypesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const qs = status !== "all" ? `?status=${status}` : "";
      const response = await http.get(`/admin/product-types${qs}`);
      setRows(safeArray(response.data));
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load product types");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const remove = async (row) => {
    if (!window.confirm(`Archive or delete ${row.name}?`)) return;

    try {
      await http.delete(`/admin/product-types/${row.id}`);
      toast.success("Product type removed or archived");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not remove product type");
    }
  };

  return (
    <div data-testid="admin-product-types-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Production blueprints</div>
          <h1 className="font-display text-5xl uppercase">Product Types</h1>
          <p className="text-zinc-400 text-sm mt-3 max-w-2xl">
            Manage reusable product families. Supplier templates own visual mockups, print areas, print rules and blank costing.
          </p>
        </div>

        <div className="flex gap-3">
          <select className="input-base md:w-44" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" onClick={() => navigate("/admin/product-types/new")} className="btn-primary">
            <Plus size={14} /> New Product Type
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card text-zinc-400">Loading product types...</div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-12">
          <Boxes className="mx-auto mb-4 text-[#FF3B30]" size={44} />
          <div className="font-display text-3xl uppercase mb-2">No product types yet</div>
          <p className="text-zinc-400 text-sm mb-6">
            Start with broad blueprints such as T-Shirt, Hoodie, Mug, Cap, Canvas or Bottle.
          </p>
          <button type="button" onClick={() => navigate("/admin/product-types/new")} className="btn-primary mx-auto">
            <Plus size={14} /> Create Product Type
          </button>
        </div>
      ) : (
        <div className="border border-white/10 bg-white/[0.03] overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-white/10">
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-xs">Product type</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-xs">Category</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-xs">Blueprint</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-xs">Defaults</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-xs">Status</th>
                <th className="px-4 py-3 font-bold uppercase tracking-widest text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const flags = blueprintFlags(row);

                return (
                  <tr key={row.id} className="border-b border-white/10 last:border-b-0 hover:bg-white/[0.04]">
                    <td className="px-4 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/product-types/${row.id}`)}
                        className="text-left font-bold text-white hover:text-[#FF3B30]"
                      >
                        {row.name || "Untitled product type"}
                      </button>
                      <div className="text-xs text-zinc-500 mt-1">{row.slug || row.id}</div>
                    </td>

                    <td className="px-4 py-4 align-top text-zinc-300">
                      {row.category || "No category"}
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        {(flags.length ? flags : ["No flags set"]).map((flag) => (
                          <span key={flag} className="border border-white/10 bg-black/30 rounded px-2 py-1 text-xs text-zinc-300">
                            {flag}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top text-zinc-400">
                      <div>{countBaseViews(row)} base view(s)</div>
                      <div>{countVariationAxes(row)} variation axis/axes</div>
                      <div>{safeArray(row.attribute_ids).length} attribute(s)</div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <StatusBadge status={row.status || "draft"} />
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => navigate(`/admin/product-types/${row.id}`)} className="btn-primary text-xs">
                          Open Builder
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/product-templates/new?product_type_id=${row.id}`)}
                          className="btn-secondary text-xs"
                        >
                          Create Supplier Template
                        </button>
                        <button type="button" onClick={() => remove(row)} className="studio-danger-button" title="Delete or archive product type">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
