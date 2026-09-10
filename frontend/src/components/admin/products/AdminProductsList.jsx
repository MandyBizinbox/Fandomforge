import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../../lib/api";
import StatusBadge from "../../StatusBadge";

function money(value) { return `R ${Number(value || 0).toFixed(2)}`; }

export default function AdminProductsList() {
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();
  const load = () => http.get("/admin/products").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try { await http.delete(`/admin/products/${p.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  return (
    <div data-testid="admin-products-page">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-5xl uppercase">Products</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate("/admin/simple-products/new")} className="btn-secondary"><Plus size={14} /> New Simple Product</button>
          <button onClick={() => navigate("/admin/products/new")} className="btn-primary"><Plus size={14} /> New Template Product</button>
        </div>
      </div>
      <div className="border border-[var(--ff-card-border)]">
        <table className="table-brutal">
          <thead><tr><th>Title</th><th>Category</th><th>Price</th><th>Published</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} data-testid={`admin-product-row-${p.id}`}>
                <td>{p.title}</td><td>{p.category}</td><td>{money(p.selling_price)}</td><td><StatusBadge status={p.published ? "active" : "inactive"} /></td>
                <td className="text-right"><button onClick={() => navigate(`/admin/products/${p.id}`)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] hover:text-[var(--ff-card-text)] font-bold mr-3">Edit</button><button onClick={() => remove(p)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold">Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-[var(--ff-muted-text)] overline">No products</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
