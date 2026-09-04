import React, { useState } from "react";
import { Archive, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { http } from "../../lib/api";

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function ProductTemplateLifecycleActions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!id || id === "new") return null;

  const removeTemplate = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const impactResponse = await http.get(`/admin/product-templates/${id}/delete-impact`);
      const impact = impactResponse.data || {};
      const templateName = impact.template_name || "this template";
      const linkedProducts = Number(impact.linked_products || 0);
      const sellableProducts = Number(impact.sellable_products || 0);
      const unpublishedProducts = Number(impact.unpublished_products || 0);

      let message;
      if (impact.will_archive) {
        const parts = [countLabel(linkedProducts, "linked product")];
        if (sellableProducts > 0) parts.push(countLabel(sellableProducts, "sellable product"));
        if (unpublishedProducts > 0) parts.push(countLabel(unpublishedProducts, "draft/unpublished product"));

        message = [
          `Template “${templateName}” cannot be permanently deleted because it is already used by ${parts.join(", ")}.`,
          "",
          "It will be moved to Archived instead. Existing products and historical order data will continue to reference it safely.",
          "",
          "Archive this template?",
        ].join("\n");
      } else {
        message = [
          `Permanently delete template “${templateName}”?`,
          "",
          "No products currently use this template, so it can be safely removed.",
          "",
          "This cannot be undone.",
        ].join("\n");
      }

      if (!window.confirm(message)) return;

      const response = await http.delete(`/admin/product-templates/${id}`);
      const result = response.data || {};

      if (result.status === "archived") {
        toast.success(`Template archived because ${countLabel(result.linked_products || linkedProducts, "product")} still use it.`);
      } else {
        toast.success("Template permanently deleted");
      }

      navigate("/admin/product-templates");
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const message = typeof detail === "string" ? detail : detail?.message;
      toast.error(message || "Could not remove product template");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed right-6 top-24 z-[70]">
      <button
        type="button"
        onClick={removeTemplate}
        disabled={busy}
        className="btn-secondary border-red-500/50 text-red-300 bg-black/90 shadow-xl"
        title="Delete template, or archive it automatically when products already use it"
      >
        {busy ? <Archive size={14} /> : <Trash2 size={14} />}
        {busy ? "Checking…" : "Delete template"}
      </button>
    </div>
  );
}
