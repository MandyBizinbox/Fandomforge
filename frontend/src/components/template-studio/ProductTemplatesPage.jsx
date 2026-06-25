import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Plus, Brush, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { money, safeArray } from "./templateStudioUtils";

export default function ProductTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState("");
  const [status, setStatus] = useState("all");
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const qs = status !== "all" ? `?status=${status}` : "";
      const response = await http.get(`/admin/product-templates${qs}`);
      setTemplates(safeArray(response.data));
    } catch (error) {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const duplicateTemplate = async (event, template) => {
    event.preventDefault();
    event.stopPropagation();

    if (!template?.id) return;

    setDuplicatingId(template.id);
    try {
      const response = await http.post(`/admin/product-templates/duplicate/${template.id}`);
      toast.success("Template duplicated");
      await load();
      if (response.data?.id) {
        navigate(`/admin/product-templates/${response.data.id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not duplicate template");
    } finally {
      setDuplicatingId("");
    }
  };

  return (
    <div data-testid="admin-product-templates-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Production catalogue</div>
          <h1 className="font-display text-5xl uppercase">Product Templates</h1>
          <p className="text-zinc-400 text-sm mt-3 max-w-2xl">
            Build blank product templates with variation images, production costs, mockup views and printable areas.
          </p>
        </div>
        <div className="flex gap-3">
          <select className="input-base md:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" onClick={() => navigate("/admin/product-templates/new")} className="btn-primary">
            <Plus size={14} /> New Template
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card text-zinc-400">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="card text-center py-12">
          <Brush className="mx-auto mb-4 text-[#FF3B30]" size={40} />
          <div className="font-display text-3xl uppercase mb-2">No templates yet</div>
          <p className="text-zinc-400 text-sm mb-6">Create your first production-safe blank product template.</p>
          <button type="button" onClick={() => navigate("/admin/product-templates/new")} className="btn-primary mx-auto">
            <Plus size={14} /> Create Template
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {templates.map((template) => {
            const image = template.product_image_url || template.mockup_url || template.mockup_screens?.find((screen) => screen.image_url)?.image_url;
            return (
              <div
                key={template.id}
                className="text-left border border-white/15 bg-white/[0.03] hover:border-[#FF3B30] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/admin/product-templates/${template.id}`)}
                  className="block w-full text-left"
                >
                  <div className="aspect-[4/3] bg-black border-b border-white/10 flex items-center justify-center overflow-hidden">
                    {image ? (
                      <img src={assetUrl(image)} alt={template.name} className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="text-zinc-700" size={44} />
                    )}
                  </div>
                </button>

                <div className="p-5">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/product-templates/${template.id}`)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h2 className="font-display text-2xl uppercase leading-tight">{template.name}</h2>
                        <p className="text-xs text-zinc-500 mt-1">{template.brand || "No brand"} {template.blank_sku ? `· ${template.blank_sku}` : ""}</p>
                      </div>
                      <StatusBadge status={template.status || "draft"} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">Cost</span>{money(template.base_blank_cost || template.base_price)}</div>
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">Vars</span>{safeArray(template.variations).length}</div>
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">Areas</span>{safeArray(template.print_areas).length}</div>
                    </div>
                  </button>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/product-templates/${template.id}`)}
                      className="btn-secondary text-xs flex-1"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(event) => duplicateTemplate(event, template)}
                      disabled={duplicatingId === template.id}
                      className="btn-secondary text-xs flex-1"
                    >
                      <Copy size={13} /> {duplicatingId === template.id ? "Duplicating…" : "Duplicate"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
