import React, { useCallback, useEffect, useMemo, useState } from "react";
import { http } from "../../../lib/api";
import StatusBadge from "../../StatusBadge";
import { toast } from "sonner";
import { Shield, Save, Link as LinkIcon } from "lucide-react";

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
  return <span className="inline-flex items-center border border-[var(--ff-card-border)] px-2 py-1 text-[10px] uppercase tracking-widest ff-admin-muted">{children}</span>;
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
    <div className="ff-admin-card space-y-4">
      <div>
        <p className="overline mb-2">{editing ? "Edit" : "Create"}</p>
        <h3 className="font-display text-2xl uppercase">{editing ? "Update user" : "New user"}</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="ff-admin-label">Name</label>
          <input className="ff-admin-control" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="ff-admin-label">Email</label>
          <input className="ff-admin-control" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className="ff-admin-label">Role</label>
          <select className="ff-admin-control" value={form.role} onChange={(e) => set("role", e.target.value)}>
            {SYSTEM_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
        </div>
        <div>
          <label className="ff-admin-label">Status</label>
          <select className="ff-admin-control" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {ACCOUNT_STATUS.map((status) => <option key={status} value={status}>{roleLabel(status)}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="ff-admin-label">{editing ? "New password (optional)" : "Password"}</label>
          <input className="ff-admin-control" type="password" value={form.password || ""} onChange={(e) => set("password", e.target.value)} />
        </div>
      </div>

      {form.role === "manager" && (
        <div className="ff-admin-subpanel p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-[var(--ff-primary)]" />
            <div>
              <p className="font-bold uppercase tracking-widest text-xs">Manager permissions</p>
              <p className="text-xs ff-admin-muted">Owner-only billing and system controls are intentionally not grantable here.</p>
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

      <button onClick={onSubmit} disabled={saving} className="ff-admin-button ff-admin-button--primary inline-flex items-center gap-2">
        <Save size={16} /> {saving ? "Saving…" : editing ? "Save user" : "Create user"}
      </button>
    </div>
  );
}

function UsersTable({ users, onEdit, onArchive }) {
  return (
    <div className="ff-admin-card p-0 overflow-x-auto">
      <table className="table-brutal">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Manager access</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="font-bold">{u.name}</div>
                <div className="text-xs ff-admin-muted">{u.email}</div>
              </td>
              <td>{roleLabel(u.role)}</td>
              <td><StatusBadge status={u.status || "active"} /></td>
              <td>
                {u.role === "manager" ? (
                  <div className="flex flex-wrap gap-1 max-w-xl">
                    {Object.entries(u.manager_permissions || {}).filter(([, v]) => v).slice(0, 5).map(([key]) => <Pill key={key}>{key.replace("manage_", "")}</Pill>)}
                    {Object.entries(u.manager_permissions || {}).filter(([, v]) => v).length > 5 && <Pill>+ more</Pill>}
                  </div>
                ) : <span className="text-xs ff-admin-muted">—</span>}
              </td>
              <td className="text-right whitespace-nowrap">
                <button className="text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)] mr-4" onClick={() => onEdit(u)}>Edit</button>
                {u.status !== "archived" && (
                  <button
                    className="text-xs uppercase tracking-widest font-bold ff-admin-muted hover:text-[var(--ff-primary)]"
                    onClick={() => onArchive(u)}
                    title="Archive this user account"
                  >
                    Archive user
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!users.length && <tr><td colSpan="5" className="ff-admin-muted">No users found.</td></tr>}
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

  const loadRows = useCallback(() => {
    if (!selectedId) { setRows([]); return; }
    http.get(`/admin/${endpoint}/${selectedId}/users`).then((r) => setRows(r.data || [])).catch((e) => toast.error(e.response?.data?.detail || "Could not load users"));
  }, [endpoint, selectedId]);

  useEffect(() => { loadRows(); }, [loadRows]);

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
      <div className="ff-admin-card space-y-4">
        <div>
          <p className="overline mb-2">{accountLabel}</p>
          <h3 className="font-display text-2xl uppercase">Select account</h3>
        </div>
        <select className="ff-admin-control" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.company_name}</option>)}
        </select>
        {selectedAccount && (
          <div className="ff-admin-subpanel p-3 text-sm ff-admin-muted">
            <div className="font-bold text-[var(--ff-card-text)]">{selectedAccount.name || selectedAccount.company_name}</div>
            <div>{selectedAccount.slug ? `/${selectedAccount.slug}` : selectedAccount.contact_email}</div>
          </div>
        )}

        <div className="pt-4 border-t border-[var(--ff-card-border)]">
          <label className="ff-admin-label">Add existing user</label>
          <select className="ff-admin-control mb-3" value={form.user_id} onChange={(e) => setForm((prev) => ({ ...prev, user_id: e.target.value }))}>
            <option value="">Select user…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
          </select>
          <label className="ff-admin-label">Account role</label>
          <select className="ff-admin-control mb-3" value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}>
            {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
          <button className="ff-admin-button ff-admin-button--primary w-full inline-flex items-center justify-center gap-2" onClick={add}><LinkIcon size={15} /> Add user</button>
        </div>
      </div>

      <div className="ff-admin-card p-0 overflow-x-auto">
        <table className="table-brutal">
          <thead><tr><th>User</th><th>Account role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.membership_id || `owner-${row.user_id}`}>
                <td>
                  <div className="font-bold">{row.user?.name || "Unknown"}</div>
                  <div className="text-xs ff-admin-muted">{row.user?.email}</div>
                  {row.is_primary_owner && <Pill>Primary owner</Pill>}
                </td>
                <td>
                  {row.membership_id ? (
                    <select className="ff-admin-control py-1 text-xs" value={row.role} onChange={(e) => update(row.membership_id, { role: e.target.value })}>
                      {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                  ) : roleLabel(row.role)}
                </td>
                <td>
                  {row.membership_id ? (
                    <select className="ff-admin-control py-1 text-xs" value={row.status || "active"} onChange={(e) => update(row.membership_id, { status: e.target.value })}>
                      {ACCOUNT_STATUS.filter((s) => s !== "archived").map((status) => <option key={status} value={status}>{roleLabel(status)}</option>)}
                    </select>
                  ) : <StatusBadge status="active" />}
                </td>
                <td className="text-right">
                  {row.membership_id && <button className="text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)]" onClick={() => remove(row.membership_id)}>Remove</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="4" className="ff-admin-muted">Select an account to manage users.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { DEFAULT_MANAGER_PERMISSIONS, MembershipManager, Pill, SectionHeader, UserForm, UsersTable, emptyUserForm };
