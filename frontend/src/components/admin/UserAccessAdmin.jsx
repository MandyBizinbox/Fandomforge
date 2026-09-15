import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { DEFAULT_MANAGER_PERMISSIONS, MembershipManager, Pill, SectionHeader, UserForm, UsersTable, emptyUserForm } from "./access/UserAccessPanels";

export default function UserAccessAdmin() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [creators, setBands] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyUserForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    http.get("/admin/access/overview").then((r) => setOverview(r.data)).catch(() => {});
    http.get("/admin/users").then((r) => setUsers(r.data || [])).catch((e) => toast.error(e.response?.data?.detail || "Could not load users"));
    http.get("/admin/creators").then((r) => setBands(r.data || [])).catch(() => {});
    http.get("/printers").then((r) => setPrinters(r.data || [])).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => !needle || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(needle));
  }, [users, query]);

  const managerUsers = filteredUsers.filter((u) => u.role === "manager");

  const edit = (u) => {
    setEditingId(u.id);
    setForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "buyer",
      status: u.status || "active",
      manager_permissions: { ...DEFAULT_MANAGER_PERMISSIONS, ...(u.manager_permissions || {}) },
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyUserForm());
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (editingId && !payload.password) delete payload.password;
      if (payload.role !== "manager") payload.manager_permissions = {};
      if (editingId) await http.patch(`/admin/users/${editingId}`, payload);
      else await http.post("/admin/users", payload);
      toast.success(editingId ? "User updated" : "User created");
      resetForm();
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save user");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (u) => {
    const label = u?.name || u?.email || "this user";
    if (!window.confirm(`Archive "${label}"? This will remove them from the active user list without permanently deleting historical records.`)) return;

    try {
      await http.delete(`/admin/users/${u.id}`);
      toast.success("User archived");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not archive user");
    }
  };

  const tabs = [
    ["users", "All Users"],
    ["managers", "Managers"],
    ["creator-users", "Creator Users"],
    ["printer-users", "Printer Users"],
  ];

  return (
    <div data-testid="admin-user-access-page">
      <SectionHeader eyebrow="Users & Access" title="Team control">
        <div className="flex flex-wrap gap-2">
          <Pill>{overview?.users_total || users.length} users</Pill>
          <Pill>{overview?.managers_total || managerUsers.length} managers</Pill>
          <Pill>{overview?.band_members_total || 0} creator links</Pill>
          <Pill>{overview?.printer_members_total || 0} printer links</Pill>
        </div>
      </SectionHeader>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`ff-admin-section-link ${tab === key ? "is-active" : ""}`}>{label}</button>
        ))}
      </div>

      {(tab === "users" || tab === "managers") && (
        <div className="space-y-6">
          <UserForm form={form} setForm={setForm} onSubmit={save} saving={saving} editing={!!editingId} />
          {editingId && <button className="text-xs uppercase tracking-widest ff-admin-muted" onClick={resetForm}>Cancel edit</button>}

          <div className="ff-admin-card flex items-center gap-3">
            <Search size={16} className="ff-admin-muted" />
            <input className="bg-transparent outline-none flex-1 text-sm" placeholder="Search users by name, email or role…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <UsersTable users={tab === "managers" ? managerUsers : filteredUsers} onEdit={edit} onArchive={archive} />
        </div>
      )}

      {tab === "creator-users" && <MembershipManager type="creator" accounts={creators} users={users} loadUsers={load} />}
      {tab === "printer-users" && <MembershipManager type="printer" accounts={printers} users={users} loadUsers={load} />}
    </div>
  );
}
