import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

export default function SellableProductsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const response = await http.get("/admin/products");
      setRows(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load products");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (product) => {
    if (!window.confirm(`Delete "${product.title}"?`)) return;
    try {
      await http.delete(`/admin/products/${product.id}`);
      toast.success("Deleted");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed");
    }
  };

  return (
    <div data-testid="admin-products-page" className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="overline mb-2">Sellable catalogue</div>
          <h1 className="font-display text-5xl uppercase">Products</h1>
          <p className="text-sm text-[var(--ff-muted-text)] mt-2 max-w-3xl">
            Customer-facing products backed by Mongo product records. Template products open in the Product Builder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate("/admin/simple-products/new")} className="btn-secondary">
            <Plus size={14} /> New Simple Product
          </button>
          <button type="button" onClick={() => navigate("/admin/products/new")} className="btn-primary">
            <Plus size={14} /> New Template Product
          </button>
        </div>
      </div>

      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal min-w-[720px]">
          <thead>
            <tr><th>Title</th><th>Category</th><th>Price</th><th>Published</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-10 text-center text-[var(--ff-muted-text)] overline">Loading products…</td></tr>}
            {!loading && rows.map((product) => (
              <tr key={product.id} data-testid={`admin-product-row-${product.id}`}>
                <td>{product.title}</td>
                <td>{product.category}</td>
                <td>{money(product.selling_price)}</td>
                <td><StatusBadge status={product.published ? "active" : "inactive"} /></td>
                <td className="text-right whitespace-nowrap">
                  <button type="button" onClick={() => navigate(`/admin/products/${product.id}`)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] hover:text-[var(--ff-card-text)] font-bold mr-3">Edit</button>
                  <button type="button" onClick={() => remove(product)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold">Delete</button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-[var(--ff-muted-text)] overline">No products</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
