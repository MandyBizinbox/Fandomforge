import React, { useEffect, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function CategoriesAdmin() {
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");

  const load = () => http.get("/categories").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await http.post("/categories", { name });
      toast.success("Created");
      setName("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const rename = async (cat) => {
    const next = window.prompt("New name", cat.name);
    if (!next || next === cat.name) return;
    try {
      await http.patch(`/categories/${cat.id}`, { name: next });
      toast.success("Saved");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const remove = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? Products using it won't be auto-updated.`)) return;
    try {
      await http.delete(`/categories/${cat.id}`);
      toast.success("Deleted");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid="admin-categories-page">
      <div className="overline mb-2">Taxonomy</div>
      <h1 className="font-display text-5xl uppercase mb-8">Categories</h1>

      <form onSubmit={create} className="flex gap-3 mb-8 max-w-lg" data-testid="cat-create-form">
        <input className="input-base" placeholder="New category name (e.g., Sticker)" value={name} onChange={(e) => setName(e.target.value)} data-testid="cat-name-input" />
        <button type="submit" className="btn-primary"><Plus size={14} /> Add</button>
      </form>

      <div className="border border-white/15">
        <table className="table-brutal">
          <thead><tr><th>Name</th><th>Slug</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} data-testid={`cat-row-${c.slug}`}>
                <td className="font-bold">{c.name}</td>
                <td className="text-zinc-400">/{c.slug}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={() => rename(c)} className="text-xs uppercase tracking-widest text-[#FF3B30] hover:text-white font-bold mr-3" data-testid={`cat-edit-${c.slug}`}>Rename</button>
                  <button onClick={() => remove(c)} className="text-xs uppercase tracking-widest text-zinc-400 hover:text-[#FF3B30] font-bold" data-testid={`cat-delete-${c.slug}`}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="p-10 text-center text-zinc-500 overline">No categories</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
