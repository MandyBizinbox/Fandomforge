import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { toast } from "sonner";
import { Shield, Users, UserPlus, Search, Save, KeyRound, Link as LinkIcon } from "lucide-react";

const SYSTEM_ROLES = ["buyer", "creator", "printer", "manager", "admin", "super_admin"];
const ACCOUNT_STATUS = ["active", "pending", "suspended", "archived"];

const MANAGER_PERMISSIONS = [
  ["manage_users", "Users & Access"],
  ["manage_bands", "Creator accounts"],
  ["manage_band_users", "Creator users"],
  ["manage_products", "Creator products"],
  ["manage_product_templates", "Product templates"],
  ["manage_orders", "Orders"],
  ["manage_artwork_review", "Artwork review"],
  ["manage_printers", "Printer accounts"],
  ["manage_printer_users", "Printer users"],
  ["manage_printer_pricing", "Printer pricing"],
  ["manage_shipping", "Shipping settings"],
  ["manage_shop_payment_gateways", "Shop payment gateways"],
  ["manage_reports", "Reports"],
  ["manage_platform_branding", "Platform branding"],
  ["manage_subscriptions", "Creator/printer subscriptions"],
  ["manage_payouts", "Payouts"],
];

const BAND_ROLES = ["owner", "admin", "products", "orders", "finance", "viewer"];
const PRINTER_ROLES = ["owner", "admin", "production", "dispatch", "finance", "viewer"];

const DEFAULT_MANAGER_PERMISSIONS = MANAGER_PERMISSIONS.reduce((acc, [key]) => ({ ...acc, [key]: false }), {});

function emptyUserForm() {
  return {
    name: "",
    email: "",
    password: "",
    role: "buyer",
    status: "active",
    manager_permissions: { ...DEFAULT_MANAGER_PERMISSIONS },
  };
}

function roleLabel(role) {
  return String(role || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function Pill({ children }) {
  return <span className="inline-flex items-center border border-[var(--ff-card-border)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)]">{children}</span>;
}

function SectionHeader({ eyebrow, title, children }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
      <div>
        <p className="overline mb-2">{eyebrow}</p>
        <h2 className="font-display text-4xl uppercase">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function UserForm({ form, setForm, onSubmit, saving, editing }) {
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setPermission = (key, value) => setForm((prev) => ({
    ...prev,
    manager_permissions: { ...(prev.manager_permissions || {}), [key]: value },
  }));

  return (
    <div className="card space-y-4">
      <div>
        <p className="overline mb-2">{editing ? "Edit" : "Create"}</p>
        <h3 className="font-display text-2xl uppercase">{editing ? "Update user" : "New user"}</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Name</label>
          <input className="input-base" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input-base" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input-base" value={form.role} onChange={(e) => set("role", e.target.value)}>
            {SYSTEM_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input-base" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {ACCOUNT_STATUS.map((status) => <option key={status} value={status}>{roleLabel(status)}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">{editing ? "New password (optional)" : "Password"}</label>
          <input className="input-base" type="password" value={form.password || ""} onChange={(e) => set("password", e.target.value)} />
        </div>
      </div>

      {form.role === "manager" && (
        <div className="border border-[var(--ff-card-border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-[var(--ff-primary)]" />
            <div>
              <p className="font-bold uppercase tracking-widest text-xs">Manager permissions</p>
              <p className="text-xs text-[var(--ff-muted-text)]">Owner-only billing and system controls are intentionally not grantable here.</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {MANAGER_PERMISSIONS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm border border-[var(--ff-card-border)] px-3 py-2">
                <input type="checkbox" checked={!!form.manager_permissions?.[key]} onChange={(e) => setPermission(key, e.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <button onClick={onSubmit} disabled={saving} className="btn-primary inline-flex items-center gap-2">
        <Save size={16} /> {saving ? "Saving…" : editing ? "Save user" : "Create user"}
      </button>
    </div>
  );
}

function UsersTable({ users, onEdit, onArchive }) {
  return (
    <div className="border border-[var(--ff-card-border)] overflow-x-auto">
      <table className="table-brutal">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Manager access</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="font-bold">{u.name}</div>
                <div className="text-xs text-[var(--ff-muted-text)]">{u.email}</div>
              </td>
              <td>{roleLabel(u.role)}</td>
              <td><StatusBadge status={u.status || "active"} /></td>
              <td>
                {u.role === "manager" ? (
                  <div className="flex flex-wrap gap-1 max-w-xl">
                    {Object.entries(u.manager_permissions || {}).filter(([, v]) => v).slice(0, 5).map(([key]) => <Pill key={key}>{key.replace("manage_", "")}</Pill>)}
                    {Object.entries(u.manager_permissions || {}).filter(([, v]) => v).length > 5 && <Pill>+ more</Pill>}
                  </div>
                ) : <span className="text-xs text-[var(--ff-muted-text)]">—</span>}
              </td>
              <td className="text-right whitespace-nowrap">
                <button className="text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)] mr-4" onClick={() => onEdit(u)}>Edit</button>
                {u.status !== "archived" && (
                  <button
                    className="text-xs uppercase tracking-widest font-bold text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]"
                    onClick={() => onArchive(u)}
                    title="Archive this user account"
                  >
                    Archive user
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!users.length && <tr><td colSpan="5" className="text-[var(--ff-muted-text)]">No users found.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function MembershipManager({ type, accounts, users, loadUsers }) {
  const [selectedId, setSelectedId] = useState("");
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ user_id: "", role: type === "creator" ? "viewer" : "viewer", status: "active" });
  const accountLabel = type === "creator" ? "Creator" : "Printer";
  const endpoint = type === "creator" ? "creators" : "printers";
  const roleOptions = type === "creator" ? BAND_ROLES : PRINTER_ROLES;

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === selectedId), [accounts, selectedId]);

  const loadRows = () => {
    if (!selectedId) { setRows([]); return; }
    http.get(`/admin/${endpoint}/${selectedId}/users`).then((r) => setRows(r.data || [])).catch((e) => toast.error(e.response?.data?.detail || "Could not load users"));
  };

  useEffect(() => { loadRows(); }, [selectedId]);

  const add = async () => {
    if (!selectedId || !form.user_id) return toast.error("Select an account and a user");
    try {
      const res = await http.post(`/admin/${endpoint}/${selectedId}/users`, { ...form, permissions: {} });
      setRows(res.data || []);
      setForm((prev) => ({ ...prev, user_id: "" }));
      loadUsers?.();
      toast.success("User added");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add user");
    }
  };

  const update = async (membershipId, patch) => {
    try {
      const res = await http.patch(`/admin/${endpoint}/${selectedId}/users/${membershipId}`, patch);
      setRows(res.data || []);
      toast.success("Updated");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update membership");
    }
  };

  const remove = async (membershipId) => {
    try {
      const res = await http.delete(`/admin/${endpoint}/${selectedId}/users/${membershipId}`);
      setRows(res.data || []);
      toast.success("Removed");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not remove membership");
    }
  };

  return (
    <div className="grid xl:grid-cols-[360px_1fr] gap-6">
      <div className="card space-y-4">
        <div>
          <p className="overline mb-2">{accountLabel}</p>
          <h3 className="font-display text-2xl uppercase">Select account</h3>
        </div>
        <select className="input-base" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.company_name}</option>)}
        </select>
        {selectedAccount && (
          <div className="border border-[var(--ff-card-border)] p-3 text-sm text-[var(--ff-muted-text)]">
            <div className="font-bold text-[var(--ff-card-text)]">{selectedAccount.name || selectedAccount.company_name}</div>
            <div>{selectedAccount.slug ? `/${selectedAccount.slug}` : selectedAccount.contact_email}</div>
          </div>
        )}

        <div className="pt-4 border-t border-[var(--ff-card-border)]">
          <label className="label">Add existing user</label>
          <select className="input-base mb-3" value={form.user_id} onChange={(e) => setForm((prev) => ({ ...prev, user_id: e.target.value }))}>
            <option value="">Select user…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
          </select>
          <label className="label">Account role</label>
          <select className="input-base mb-3" value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}>
            {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
          <button className="btn-primary w-full inline-flex items-center justify-center gap-2" onClick={add}><LinkIcon size={15} /> Add user</button>
        </div>
      </div>

      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal">
          <thead><tr><th>User</th><th>Account role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.membership_id || `owner-${row.user_id}`}>
                <td>
                  <div className="font-bold">{row.user?.name || "Unknown"}</div>
                  <div className="text-xs text-[var(--ff-muted-text)]">{row.user?.email}</div>
                  {row.is_primary_owner && <Pill>Primary owner</Pill>}
                </td>
                <td>
                  {row.membership_id ? (
                    <select className="input-base py-1 text-xs" value={row.role} onChange={(e) => update(row.membership_id, { role: e.target.value })}>
                      {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                  ) : roleLabel(row.role)}
                </td>
                <td>
                  {row.membership_id ? (
                    <select className="input-base py-1 text-xs" value={row.status || "active"} onChange={(e) => update(row.membership_id, { status: e.target.value })}>
                      {ACCOUNT_STATUS.filter((s) => s !== "archived").map((status) => <option key={status} value={status}>{roleLabel(status)}</option>)}
                    </select>
                  ) : <StatusBadge status="active" />}
                </td>
                <td className="text-right">
                  {row.membership_id && <button className="text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)]" onClick={() => remove(row.membership_id)}>Remove</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="4" className="text-[var(--ff-muted-text)]">Select an account to manage users.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 border text-xs uppercase tracking-widest font-bold ${tab === key ? "bg-white text-black border-white" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}>{label}</button>
        ))}
      </div>

      {(tab === "users" || tab === "managers") && (
        <div className="space-y-6">
          <UserForm form={form} setForm={setForm} onSubmit={save} saving={saving} editing={!!editingId} />
          {editingId && <button className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]" onClick={resetForm}>Cancel edit</button>}

          <div className="card flex items-center gap-3">
            <Search size={16} className="text-[var(--ff-muted-text)]" />
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
