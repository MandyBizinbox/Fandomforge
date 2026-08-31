import React, { useEffect, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

function ValueChips({ values, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  };
  const remove = (v) => onChange(values.filter((x) => x !== v));
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 px-3 py-1 border border-[var(--ff-card-border)] text-xs uppercase tracking-widest" data-testid={`chip-${v}`}>
            {v}
            <button type="button" onClick={() => remove(v)} className="hover:text-[var(--ff-primary)]"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input-base text-sm py-1" placeholder="Add value, press Enter" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          data-testid="chip-input" />
        <button type="button" onClick={add} className="btn-secondary text-xs">Add</button>
      </div>
    </div>
  );
}

export default function AttributesAdmin() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => http.get("/attributes").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const startNew = () => setEditing({ id: null, name: "", values: [], used_for_variation: true });
  const startEdit = (a) => setEditing({ ...a });

  const save = async (e) => {
    e.preventDefault();
    if (!editing.name || editing.values.length === 0) {
      toast.error("Name + at least one value required"); return;
    }
    try {
      if (editing.id) {
        await http.patch(`/attributes/${editing.id}`, {
          name: editing.name, values: editing.values, used_for_variation: editing.used_for_variation,
        });
      } else {
        await http.post("/attributes", {
          name: editing.name, values: editing.values, used_for_variation: editing.used_for_variation,
        });
      }
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete attribute "${a.name}"?`)) return;
    try { await http.delete(`/attributes/${a.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid="admin-attributes-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="overline mb-2">Catalog</div>
          <h1 className="font-display text-5xl uppercase">Attributes</h1>
        </div>
        {!editing && <button onClick={startNew} className="btn-primary" data-testid="attr-new-btn"><Plus size={14} /> New Attribute</button>}
      </div>

      {editing && (
        <form onSubmit={save} className="card mb-8 max-w-2xl space-y-4" data-testid="attr-form">
          <div>
            <label className="label">Attribute name</label>
            <input className="input-base" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g., Size, Color, Material" data-testid="attr-name" />
          </div>
          <div>
            <label className="label">Values</label>
            <ValueChips values={editing.values} onChange={(values) => setEditing({ ...editing, values })} />
          </div>
          <label className="flex items-center gap-3 text-sm" data-testid="attr-var-toggle">
            <input type="checkbox" checked={editing.used_for_variation} onChange={(e) => setEditing({ ...editing, used_for_variation: e.target.checked })} />
            Used as variation (generates SKUs in the variation grid)
          </label>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary" data-testid="attr-save">{editing.id ? "Save" : "Create"}</button>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal min-w-[720px]">
          <thead><tr><th>Name</th><th>Values</th><th>Used as variation</th><th></th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} data-testid={`attr-row-${a.slug}`}>
                <td className="font-bold">{a.name}</td>
                <td className="text-[var(--ff-muted-text)] text-xs">{a.values.join(", ")}</td>
                <td>{a.used_for_variation ? <span className="badge badge-success">Yes</span> : <span className="badge badge-muted">No</span>}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={() => startEdit(a)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] hover:text-[var(--ff-card-text)] font-bold mr-3" data-testid={`attr-edit-${a.slug}`}>Edit</button>
                  <button onClick={() => remove(a)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold" data-testid={`attr-delete-${a.slug}`}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-[var(--ff-muted-text)] overline">No attributes — create your first</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
