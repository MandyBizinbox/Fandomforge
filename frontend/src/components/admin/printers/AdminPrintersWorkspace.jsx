import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../../lib/api";
import StatusBadge from "../../StatusBadge";
import ProductionJobCard from "../../production/ProductionJobCard";
import UserAccessAdmin from "../UserAccessAdmin";
import SubscriptionManagerAdmin from "../SubscriptionManagerAdmin";
import PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";
import { canAccess, visiblePrinterTabs } from "./printerWorkspaceAccess";

const PRINTER_PRODUCT_CAPABILITIES = ["Apparel", "Mugs & drinkware", "Caps", "Paper Printing"];
const PRINTER_METHOD_OPTIONS = [
  { key: "dtf", label: "DTF" },
  { key: "sublimation", label: "Sublimation" },
  { key: "embroidery", label: "Embroidery" },
  { key: "vinyl", label: "Vinyl" },
  { key: "screen_print", label: "Screen Print" },
  { key: "dtg", label: "DTG" },
  { key: "uv_print", label: "UV Print" },
];
const PRINTER_AREA_TAGS = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "sleeve", label: "Sleeve" },
  { key: "neck_label", label: "Neck Label" },
  { key: "pocket", label: "Pocket" },
];

const emptyPrinterForm = {
  company_name: "",
  trading_name: "",
  contact_person: "",
  contact_email: "",
  phone: "",
  business_phone: "",
  whatsapp: "",
  location: "",
  city: "",
  province: "",
  capabilities: [],
  print_methods: [],
  area_tags: [],
  capability_matrix: [],
  website_url: "",
  logo_url: "",
  banner_url: "",
  profile_image_url: "",
  production_notes: "",
  status: "active",
  user_id: "",
};

function safeJsonObjectFromText(value) {
  if (!value || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonText(value) {
  if (!value || typeof value !== "object") return "";
  return JSON.stringify(value, null, 2);
}

function csvText(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function toggleListValue(list, value) {
  const current = Array.isArray(list) ? list : [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function matrixKey(methodKey, areaTag) {
  return `${methodKey}::${areaTag}`;
}

function buildCapabilityMatrix(methods, areaTags, existingMatrix = []) {
  const existing = {};
  for (const row of existingMatrix || []) {
    existing[matrixKey(row.method_key, row.area_tag)] = row;
  }

  const rows = [];
  for (const methodKey of methods || []) {
    for (const areaTag of areaTags || []) {
      const key = matrixKey(methodKey, areaTag);
      rows.push({
        method_key: methodKey,
        area_tag: areaTag,
        active: existing[key]?.active ?? true,
        turnaround_time: existing[key]?.turnaround_time || "",
        notes: existing[key]?.notes || "",
      });
    }
  }

  return rows;
}

function CapabilityButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 border text-xs uppercase tracking-widest ${active ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]/10 text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}
    >
      {active ? "✓ " : ""}{children}
    </button>
  );
}


function AssetUploadField({ label, value, onChange, subdir = "account-assets" }) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("subdir", subdir);

    setUploading(true);
    try {
      const response = await http.post("/files/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(response.data.url);
      toast.success(`${label} uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.detail || `Could not upload ${label.toLowerCase()}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] rounded-xl p-3">
      <label className="label">{label}</label>
      <div className="aspect-[4/3] bg-[var(--ff-card-bg)] border border-[var(--ff-card-border)] rounded-lg overflow-hidden flex items-center justify-center mb-3">
        {value ? (
          <img src={assetUrl(value)} alt={label} className="w-full h-full object-contain" />
        ) : (
          <div className="text-xs text-[var(--ff-muted-text)] uppercase tracking-widest">No image</div>
        )}
      </div>
      <div className="flex gap-2">
        <label className="btn-secondary text-xs flex-1 justify-center cursor-pointer">
          {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
          <input type="file" accept="image/*" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
        </label>
        {value && (
          <button type="button" className="border border-[var(--ff-card-border)] px-3 text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]" onClick={() => onChange("")}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function PrintersAdmin() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyPrinterForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [printerRes, userRes] = await Promise.all([
      http.get("/admin/printers"),
      http.get("/admin/users").catch(() => ({ data: [] })),
    ]);
    setRows(Array.isArray(printerRes.data) ? printerRes.data : []);
    setUsers(Array.isArray(userRes.data) ? userRes.data : []);
  };

  useEffect(() => { load().catch((e) => toast.error(e.response?.data?.detail || "Could not load printers")); }, []);

  const reset = () => {
    setEditingId(null);
    setForm(emptyPrinterForm);
  };

  const edit = (row) => {
    setEditingId(row.id);
    setForm({
      company_name: row.company_name || "",
      trading_name: row.trading_name || "",
      contact_person: row.contact_person || "",
      contact_email: row.contact_email || "",
      phone: row.phone || "",
      business_phone: row.business_phone || "",
      whatsapp: row.whatsapp || "",
      location: row.location || "",
      city: row.city || "",
      province: row.province || "",
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      print_methods: Array.isArray(row.print_methods) ? row.print_methods : [],
      area_tags: Array.isArray(row.area_tags) ? row.area_tags : [],
      capability_matrix: Array.isArray(row.capability_matrix) ? row.capability_matrix : [],
      website_url: row.website_url || "",
      logo_url: row.logo_url || "",
      banner_url: row.banner_url || "",
      profile_image_url: row.profile_image_url || "",
      production_notes: row.production_notes || "",
      status: row.status || "active",
      user_id: row.user_id || "",
    });
  };

  const payload = () => ({
    company_name: form.company_name,
    trading_name: form.trading_name,
    contact_person: form.contact_person,
    contact_email: form.contact_email,
    phone: form.phone,
    business_phone: form.business_phone,
    whatsapp: form.whatsapp,
    location: form.location,
    city: form.city,
    province: form.province,
    capabilities: form.capabilities || [],
    print_methods: form.print_methods || [],
    area_tags: form.area_tags || [],
    capability_matrix: buildCapabilityMatrix(form.print_methods || [], form.area_tags || [], form.capability_matrix || []),
    website_url: form.website_url,
    logo_url: form.logo_url || null,
    banner_url: form.banner_url || null,
    profile_image_url: form.profile_image_url || null,
    production_notes: form.production_notes,
    status: form.status,
    user_id: form.user_id || null,
  });

  const save = async (event) => {
    event.preventDefault();
    if (!form.company_name.trim() || !form.contact_email.trim()) {
      toast.error("Printer company name and email are required");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await http.patch(`/admin/printers/${editingId}`, payload());
        toast.success("Printer updated");
      } else {
        await http.post("/admin/printers", payload());
        toast.success("Printer created");
      }
      reset();
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save printer");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete or archive printer "${row.company_name}"?`)) return;
    try {
      await http.delete(`/admin/printers/${row.id}`);
      toast.success("Printer removed or archived");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not remove printer");
    }
  };

  const linkUser = async (row, userId) => {
    if (!userId) return;
    try {
      await http.post(`/admin/printers/${row.id}/link-user`, { user_id: userId, role: "owner" });
      toast.success("User linked to printer");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not link user");
    }
  };

  return (
    <div data-testid="admin-printers-page" className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="overline mb-2">Production Account Management</div>
          <h1 className="font-display text-5xl uppercase">Printers</h1>
          <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Create, edit and manage printer accounts, production capabilities, profile images, banners and user ownership.</p>
        </div>
        <button type="button" onClick={reset} className="btn-secondary"><Plus size={14} /> New Printer</button>
      </div>

      <form onSubmit={save} className="card grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-3">
          <div className="overline mb-2">{editingId ? "Edit Printer" : "Create Printer"}</div>
          <h2 className="font-display text-3xl uppercase">{editingId ? form.company_name || "Edit account" : "New printer account"}</h2>
        </div>

        <label><span className="label">Company name</span><input className="input-base" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></label>
        <label><span className="label">Trading name</span><input className="input-base" value={form.trading_name} onChange={(e) => setForm({ ...form, trading_name: e.target.value })} /></label>
        <label><span className="label">Contact person</span><input className="input-base" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></label>

        <label><span className="label">Email</span><input className="input-base" required type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></label>
        <label><span className="label">Phone</span><input className="input-base" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label><span className="label">WhatsApp</span><input className="input-base" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></label>

        <label><span className="label">City</span><input className="input-base" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label><span className="label">Province</span><input className="input-base" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></label>
        <label><span className="label">Location label</span><input className="input-base" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="auto from city/province if blank" /></label>

        <div className="lg:col-span-3 border border-[var(--ff-card-border)] rounded-xl p-4 bg-[var(--ff-card-bg)] space-y-4">
          <div>
            <div className="overline mb-2">Capability matrix</div>
            <p className="text-sm text-[var(--ff-muted-text)]">Pricing is platform-controlled. This matrix only tells FandomForge which printer can produce which method and area.</p>
          </div>

          <div>
            <label className="label">Product capabilities</label>
            <div className="flex flex-wrap gap-2">
              {PRINTER_PRODUCT_CAPABILITIES.map((option) => (
                <CapabilityButton key={option} active={(form.capabilities || []).includes(option)} onClick={() => setForm({ ...form, capabilities: toggleListValue(form.capabilities, option) })}>
                  {option}
                </CapabilityButton>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Print methods</label>
            <div className="flex flex-wrap gap-2">
              {PRINTER_METHOD_OPTIONS.map((option) => (
                <CapabilityButton key={option.key} active={(form.print_methods || []).includes(option.key)} onClick={() => {
                  const nextMethods = toggleListValue(form.print_methods, option.key);
                  setForm({ ...form, print_methods: nextMethods, capability_matrix: buildCapabilityMatrix(nextMethods, form.area_tags, form.capability_matrix) });
                }}>
                  {option.label}
                </CapabilityButton>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Area tags</label>
            <div className="flex flex-wrap gap-2">
              {PRINTER_AREA_TAGS.map((option) => (
                <CapabilityButton key={option.key} active={(form.area_tags || []).includes(option.key)} onClick={() => {
                  const nextAreas = toggleListValue(form.area_tags, option.key);
                  setForm({ ...form, area_tags: nextAreas, capability_matrix: buildCapabilityMatrix(form.print_methods, nextAreas, form.capability_matrix) });
                }}>
                  {option.label}
                </CapabilityButton>
              ))}
            </div>
          </div>

          {(form.print_methods || []).length > 0 && (form.area_tags || []).length > 0 && (
            <div className="overflow-x-auto border border-[var(--ff-card-border)]">
              <table className="table-brutal min-w-[760px]">
                <thead>
                  <tr><th>Method</th><th>Area</th><th>Active</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {buildCapabilityMatrix(form.print_methods, form.area_tags, form.capability_matrix).map((row) => {
                    const key = matrixKey(row.method_key, row.area_tag);
                    const methodLabel = PRINTER_METHOD_OPTIONS.find((item) => item.key === row.method_key)?.label || row.method_key;
                    const areaLabel = PRINTER_AREA_TAGS.find((item) => item.key === row.area_tag)?.label || row.area_tag;

                    return (
                      <tr key={key}>
                        <td className="font-bold">{methodLabel}</td>
                        <td>{areaLabel}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.active}
                            onChange={(event) => {
                              const current = buildCapabilityMatrix(form.print_methods, form.area_tags, form.capability_matrix);
                              setForm({
                                ...form,
                                capability_matrix: current.map((item) => matrixKey(item.method_key, item.area_tag) === key ? { ...item, active: event.target.checked } : item),
                              });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input-base"
                            value={row.notes || ""}
                            onChange={(event) => {
                              const current = buildCapabilityMatrix(form.print_methods, form.area_tags, form.capability_matrix);
                              setForm({
                                ...form,
                                capability_matrix: current.map((item) => matrixKey(item.method_key, item.area_tag) === key ? { ...item, notes: event.target.value } : item),
                              });
                            }}
                            placeholder="Optional production note"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <label><span className="label">Website URL</span><input className="input-base" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /></label>

        <div className="lg:col-span-3 grid md:grid-cols-3 gap-4">
          <AssetUploadField label="Logo" value={form.logo_url} subdir="account-assets/printers" onChange={(value) => setForm({ ...form, logo_url: value })} />
          <AssetUploadField label="Banner" value={form.banner_url} subdir="account-assets/printers" onChange={(value) => setForm({ ...form, banner_url: value })} />
          <AssetUploadField label="Profile image" value={form.profile_image_url} subdir="account-assets/printers" onChange={(value) => setForm({ ...form, profile_image_url: value })} />
        </div>

        <label className="lg:col-span-2"><span className="label">Production notes</span><textarea className="input-base" rows={4} value={form.production_notes} onChange={(e) => setForm({ ...form, production_notes: e.target.value })} /></label>
        <div className="space-y-4">
          <label><span className="label">Linked owner user</span><select className="input-base" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}><option value="">No linked user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} · {u.email}</option>)}</select></label>
          <label><span className="label">Status</span><select className="input-base" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></label>
        </div>

        <div className="lg:col-span-3 flex gap-3">
          <button type="submit" className="btn-primary" disabled={saving}><Save size={14} /> {saving ? "Saving…" : editingId ? "Update Printer" : "Create Printer"}</button>
          {editingId && <button type="button" onClick={reset} className="btn-secondary">Cancel edit</button>}
        </div>
      </form>

      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal min-w-[1100px]">
          <thead><tr><th>Company</th><th>Location</th><th>Capabilities</th><th>Methods</th><th>Areas</th><th>Matrix</th><th>Owner</th><th>Status</th><th>Link user</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} data-testid={`admin-printer-row-${p.id}`}>
                <td><div className="font-bold">{p.company_name}</div><div className="text-xs text-[var(--ff-muted-text)]">{p.contact_person || "No contact"} · {p.contact_email}</div></td>
                <td>{p.location || [p.city, p.province].filter(Boolean).join(" / ")}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{(p.capabilities || []).join(", ")}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{(p.print_methods || []).join(", ")}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{(p.area_tags || []).join(", ")}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{(p.capability_matrix || []).filter((row) => row.active).length} active</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{p.user_id || "No linked owner"}</td>
                <td><StatusBadge status={p.status} /></td>
                <td><select className="input-base py-1 text-xs" defaultValue="" onChange={(e) => linkUser(p, e.target.value)}><option value="">Link user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></td>
                <td className="text-right whitespace-nowrap"><button type="button" onClick={() => edit(p)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold mr-4">Edit</button><button type="button" onClick={() => remove(p)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold">Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="p-10 text-center text-[var(--ff-muted-text)] overline">No printers yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductionAdmin() {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("all");
  const [printers, setPrinters] = useState([]);

  const load = () => {
    const qs = status !== "all" ? `?status=${status}` : "";
    http.get(`/admin/production-jobs${qs}`).then((r) => setJobs(Array.isArray(r.data) ? r.data : [])).catch(() => setJobs([]));
  };

  useEffect(() => {
    load();
    http.get("/printers").then((r) => setPrinters(Array.isArray(r.data) ? r.data : [])).catch(() => setPrinters([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const reassignOrder = async (orderId, printerId) => {
    try {
      await http.post(`/orders/${orderId}/assign-printer?printer_id=${printerId}`);
      toast.success("Printer reassigned");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not reassign printer");
    }
  };

  const autoAssignOrder = async (orderId) => {
    try {
      await http.post(`/admin/orders/${orderId}/auto-assign-printers`);
      toast.success("Best available printer assigned from pricing table");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not auto-assign printer");
    }
  };

  return (
    <div data-testid="admin-production-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Fulfilment</div>
          <h1 className="font-display text-5xl uppercase">Production Jobs</h1>
        </div>
        <select className="input-base md:w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['all', 'pending', 'accepted', 'in_production', 'ready', 'shipped', 'delivered'].map((item) => (
            <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-4">
        {jobs.map((job) => (
          <div key={`${job.order_id}-${job.item_id}`} className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <ProductionJobCard job={job} basePath="/admin/orders" />
            <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4">
              <div className="overline mb-3">Admin Controls</div>
              <div className="text-xs text-[var(--ff-muted-text)] mb-2">Current printer: <span className="text-[var(--ff-card-text)]">{job.printer_name || 'Unassigned'}</span></div>
              <button type="button" onClick={() => autoAssignOrder(job.order_id)} className="btn-primary w-full mb-3 text-xs">Auto-assign best price</button>
              <select className="input-base text-sm" value="" onChange={(e) => e.target.value && reassignOrder(job.order_id, e.target.value)}>
                <option value="">Assign/Reassign printer</option>
                {printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.company_name}</option>)}
              </select>
              <div className="mt-3 text-xs text-[var(--ff-muted-text)]">
                Creator profit: {money(job.band_earnings)}<br />
                Commission: {money(job.commission_amount)}<br />
                Printer payout: {money(job.printer_payout)}
              </div>
            </div>
          </div>
        ))}
        {jobs.length === 0 && <div className="card text-center text-[var(--ff-muted-text)] overline">No production jobs</div>}
      </div>
    </div>
  );
}

export default function AdminPrintersWorkspace({ modules = {}, user = null, mode = "admin", basePath = "/admin" }) {
  const root = `${basePath}/printers-workspace`;
  const tabs = useMemo(() => visiblePrinterTabs({ modules, user, mode, root }), [mode, modules, root, user]);

  const canAccounts = canAccess({ permission: "manage_printers", moduleKey: "printers_enabled", modules, user, mode });
  const canUsers = canAccess({ permission: "manage_printer_users", moduleKey: "printers_enabled", modules, user, mode });
  const canProduction = canAccess({ permission: "manage_orders", modules, user, mode });
  const canSubscriptions = canAccess({ permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"], modules, user, mode });
  const canPayouts = canAccess({ permission: "manage_payouts", moduleKey: "payouts_enabled", modules, user, mode });
  const fallback = tabs[0]?.to || basePath;

  return (
    <div data-testid="admin-printers-workspace-routed" className="space-y-6">
      <div>
        <p className="overline mb-2">Production Network</p>
        <h1 className="font-display text-5xl uppercase">Printers</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Printer accounts, users, production jobs, subscriptions and payouts now own concrete routes while remaining API-backed.</p>
      </div>

      {!!tabs.length && (
        <nav className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-4">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `px-4 py-3 border text-xs uppercase tracking-widest font-bold ${isActive ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      )}

      <Routes>
        <Route index element={<Navigate to={fallback} replace />} />
        {canAccounts && <Route path="accounts" element={<PrintersAdmin />} />}
        {canUsers && <Route path="users" element={<UserAccessAdmin />} />}
        {canProduction && <Route path="production" element={<ProductionAdmin />} />}
        {canSubscriptions && <Route path="subscriptions" element={<SubscriptionManagerAdmin modules={modules} />} />}
        {canPayouts && <Route path="payouts" element={<PaystackPayoutsAdmin />} />}
        <Route path="*" element={<Navigate to={fallback} replace />} />
      </Routes>
    </div>
  );
}
