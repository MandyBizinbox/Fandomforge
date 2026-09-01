import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../../lib/api";
import StatusBadge from "../../StatusBadge";
import UserAccessAdmin from "../UserAccessAdmin";
import ArtworkReviewAdmin from "../ArtworkReviewAdmin";
import SubscriptionManagerAdmin from "../SubscriptionManagerAdmin";
import PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";
import { canAccessCreatorRoute, visibleCreatorTabs } from "./creatorWorkspaceAccess";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

const emptyCreatorForm = {
  name: "",
  slug: "",
  category: "",
  bio: "",
  contact_email: "",
  contact_phone: "",
  website_url: "",
  logo_url: "",
  banner_url: "",
  profile_image_url: "",
  socials_text: "",
  platform_commission_rate_percent: "",
  platform_commission_source: "default",
  monthly_package_enabled: false,
  monthly_package_name: "",
  monthly_fee: 19.99,
  subscription_status: "inactive",
  status: "active",
  user_id: "",
  visibility: "unlisted",
  show_on_platform_gallery: false,
  gallery_display_name: "",
  gallery_logo_url: "",
  gallery_banner_url: "",
  allow_search_indexing: false,
};

const CREATOR_VISIBILITY_OPTIONS = [
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

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

function BandsAdmin({ view = "list", creatorId = null, basePath = "/admin" }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyCreatorForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [creatorRes, userRes] = await Promise.all([
      http.get("/admin/creators"),
      http.get("/admin/users").catch(() => ({ data: [] })),
    ]);
    setRows(Array.isArray(creatorRes.data) ? creatorRes.data : []);
    setUsers(Array.isArray(userRes.data) ? userRes.data : []);
  };

  useEffect(() => { load().catch((e) => toast.error(e.response?.data?.detail || "Could not load creators")); }, []);

  const reset = () => {
    setEditingId(null);
    setForm(emptyCreatorForm);
  };

  const goToList = () => navigate(`${basePath}/creators/accounts`);

  const edit = (row) => {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      slug: row.slug || "",
      category: row.category || "",
      bio: row.bio || "",
      contact_email: row.contact_email || "",
      contact_phone: row.contact_phone || "",
      website_url: row.website_url || "",
      logo_url: row.logo_url || "",
      banner_url: row.banner_url || "",
      profile_image_url: row.profile_image_url || "",
      socials_text: jsonText(row.socials),
      platform_commission_rate_percent: row.platform_commission_rate_percent ?? (row.commission_rate !== undefined && row.commission_rate !== null && Number(row.commission_rate) !== 0.15 ? Number(row.commission_rate) * 100 : ""),
      platform_commission_source: row.platform_commission_source || (row.platform_commission_rate_percent !== undefined && row.platform_commission_rate_percent !== null || Number(row.commission_rate || 0.15) !== 0.15 ? "creator_override" : "default"),
      monthly_package_enabled: Boolean(row.monthly_package_enabled),
      monthly_package_name: row.monthly_package_name || "",
      monthly_fee: row.monthly_fee ?? 19.99,
      subscription_status: row.subscription_status || "inactive",
      status: row.status || "active",
      user_id: row.user_id || "",
      visibility: row.visibility || "unlisted",
      show_on_platform_gallery: Boolean(row.show_on_platform_gallery),
      gallery_display_name: row.gallery_display_name || "",
      gallery_logo_url: row.gallery_logo_url || "",
      gallery_banner_url: row.gallery_banner_url || "",
      allow_search_indexing: Boolean(row.allow_search_indexing),
    });
  };

  useEffect(() => {
    if (view !== "edit" || !creatorId || !rows.length) return;
    const row = rows.find((item) => String(item.id) === String(creatorId));
    if (row) edit(row);
  }, [creatorId, rows, view]);

  const payload = () => ({
    name: form.name,
    slug: form.slug,
    category: form.category,
    bio: form.bio,
    contact_email: form.contact_email,
    contact_phone: form.contact_phone,
    website_url: form.website_url,
    logo_url: form.logo_url || null,
    banner_url: form.banner_url || null,
    profile_image_url: form.profile_image_url || null,
    socials: safeJsonObjectFromText(form.socials_text),
    platform_commission_rate_percent: form.platform_commission_rate_percent === "" ? null : Number(form.platform_commission_rate_percent),
    platform_commission_source: form.platform_commission_rate_percent === "" ? "default" : (form.monthly_package_enabled ? "monthly_package" : "creator_override"),
    commission_rate: form.platform_commission_rate_percent === "" ? 0.15 : Number(form.platform_commission_rate_percent || 0) / 100,
    monthly_package_enabled: Boolean(form.monthly_package_enabled),
    monthly_package_name: form.monthly_package_name || null,
    monthly_fee: Number(form.monthly_fee || 0),
    subscription_status: form.subscription_status,
    status: form.status,
    user_id: form.user_id || null,
    visibility: form.visibility || "unlisted",
    show_on_platform_gallery: Boolean(form.show_on_platform_gallery),
    gallery_display_name: form.gallery_display_name || null,
    gallery_logo_url: form.gallery_logo_url || null,
    gallery_banner_url: form.gallery_banner_url || null,
    allow_search_indexing: Boolean(form.allow_search_indexing),
  });

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Creator name is required");
      return;
    }

    setSaving(true);
    try {
      if (view === "edit" && creatorId) {
        await http.patch(`/admin/creators/${creatorId}`, payload());
        toast.success("Creator updated");
      } else {
        await http.post("/admin/creators", payload());
        toast.success("Creator created");
      }
      reset();
      goToList();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save creator");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete or archive creator "${row.name}"?`)) return;
    try {
      await http.delete(`/admin/creators/${row.id}`);
      toast.success("Creator removed or archived");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not remove creator");
    }
  };

  const linkUser = async (row, userId) => {
    if (!userId) return;
    try {
      await http.post(`/admin/creators/${row.id}/link-user`, { user_id: userId, role: "owner" });
      toast.success("User linked to creator");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not link user");
    }
  };

  return (
    <div data-testid="admin-creators-page" className="space-y-8">
      {view === "list" ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="overline mb-2">Account Management</div>
            <h1 className="font-display text-5xl uppercase">Creators</h1>
            <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Manage creator storefront accounts. Open a creator to edit its profile, publishing, billing and ownership settings.</p>
          </div>
          <button type="button" onClick={() => navigate(`${basePath}/creators/accounts/new`)} className="btn-primary"><Plus size={14} /> New Creator</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <button type="button" onClick={goToList} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)] font-bold mb-4">← Back to Creators</button>
            <div className="overline mb-2">Creator Account</div>
            <h1 className="font-display text-5xl uppercase">{view === "edit" ? (form.name || "Edit Creator") : "New Creator"}</h1>
            <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">{view === "edit" ? "Update this creator account and storefront settings." : "Create a new top-level creator storefront account."}</p>
          </div>
        </div>
      )}

      {view !== "list" && (
      <form onSubmit={save} className="card grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-3">
          <div className="overline mb-2">{view === "edit" ? "Edit Creator" : "Create Creator"}</div>
          <h2 className="font-display text-3xl uppercase">{view === "edit" ? form.name || "Edit account" : "New creator account"}</h2>
        </div>

        <label><span className="label">Name</span><input className="input-base" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label><span className="label">Slug</span><input className="input-base" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-from-name if blank" /></label>
        <label><span className="label">Category</span><input className="input-base" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Band, Club, School, Scout Group" /></label>

        <label><span className="label">Contact email</span><input className="input-base" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></label>
        <label><span className="label">Contact phone</span><input className="input-base" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></label>
        <label><span className="label">Website URL</span><input className="input-base" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /></label>

        <label className="lg:col-span-3"><span className="label">Bio / public description</span><textarea className="input-base" rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>

        <div className="lg:col-span-3 grid md:grid-cols-3 gap-4">
          <AssetUploadField label="Logo" value={form.logo_url} subdir="account-assets/creators" onChange={(value) => setForm({ ...form, logo_url: value })} />
          <AssetUploadField label="Banner" value={form.banner_url} subdir="account-assets/creators" onChange={(value) => setForm({ ...form, banner_url: value })} />
          <AssetUploadField label="Profile image" value={form.profile_image_url} subdir="account-assets/creators" onChange={(value) => setForm({ ...form, profile_image_url: value })} />
        </div>

        <div className="lg:col-span-3 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4 space-y-4">
          <div>
            <div className="overline mb-2">Publishing & Visibility</div>
            <h3 className="font-display text-3xl uppercase">Platform publishing controls</h3>
            <p className="text-sm text-[var(--ff-muted-text)] mt-1">Unlisted is recommended for Scout groups, schools, churches, clubs, and private fundraising campaigns.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <label>
              <span className="label">Store Visibility</span>
              <select className="input-base" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                {CREATOR_VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {form.visibility === "private" && (
                <p className="text-xs text-[var(--ff-muted-text)] mt-1">Private stores are reserved for future restricted-access workflows.</p>
              )}
            </label>

            <label className="md:col-span-2">
              <span className="label">Gallery Display Name</span>
              <input className="input-base" value={form.gallery_display_name} onChange={(e) => setForm({ ...form, gallery_display_name: e.target.value })} placeholder="Falls back to creator name" />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <AssetUploadField label="Gallery logo" value={form.gallery_logo_url} subdir="account-assets/creator-gallery" onChange={(value) => setForm({ ...form, gallery_logo_url: value })} />
            <AssetUploadField label="Gallery banner" value={form.gallery_banner_url} subdir="account-assets/creator-gallery" onChange={(value) => setForm({ ...form, gallery_banner_url: value })} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex items-start gap-3 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={Boolean(form.show_on_platform_gallery)} onChange={(e) => setForm({ ...form, show_on_platform_gallery: e.target.checked })} />
              <span>
                <span className="block text-sm font-bold">Show on Homepage Creator Gallery</span>
                <span className="block text-xs text-[var(--ff-muted-text)] mt-1">Homepage gallery display is social proof only. Logos/banners are not linked to creator stores.</span>
              </span>
            </label>

            <label className="flex items-start gap-3 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={Boolean(form.allow_search_indexing)} onChange={(e) => setForm({ ...form, allow_search_indexing: e.target.checked })} />
              <span>
                <span className="block text-sm font-bold">Allow Search Indexing</span>
                <span className="block text-xs text-[var(--ff-muted-text)] mt-1">Unlisted and private store pages remain noindex unless this is explicitly enabled for a public store.</span>
              </span>
            </label>
          </div>
        </div>

        <label>
          <span className="label">Platform Commission %</span>
          <input
            className="input-base"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={form.platform_commission_rate_percent}
            onChange={(e) => setForm({ ...form, platform_commission_rate_percent: e.target.value, platform_commission_source: e.target.value === "" ? "default" : "creator_override" })}
            placeholder="15"
          />
          <span className="block text-xs text-[var(--ff-muted-text)] mt-1">Leave blank to use the platform default commission. Use this for discounted creator packages or custom agreements.</span>
        </label>
        <label className="flex items-start gap-3 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={Boolean(form.monthly_package_enabled)} onChange={(e) => setForm({ ...form, monthly_package_enabled: e.target.checked, platform_commission_source: e.target.checked && form.platform_commission_rate_percent !== "" ? "monthly_package" : form.platform_commission_source })} />
          <span>
            <span className="block text-sm font-bold">Monthly package enabled</span>
            <span className="block text-xs text-[var(--ff-muted-text)] mt-1">Optional label only; commission still comes from Platform Commission %.</span>
          </span>
        </label>
        <label><span className="label">Monthly package name</span><input className="input-base" value={form.monthly_package_name} onChange={(e) => setForm({ ...form, monthly_package_name: e.target.value })} placeholder="Optional package name" /></label>
        <label><span className="label">Monthly fee</span><input className="input-base" type="number" step="0.01" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} /></label>
        <label><span className="label">Linked owner user</span><select className="input-base" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}><option value="">No linked user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} · {u.email}</option>)}</select></label>

        <label><span className="label">Subscription</span><select className="input-base" value={form.subscription_status} onChange={(e) => setForm({ ...form, subscription_status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="past_due">Past due</option></select></label>
        <label><span className="label">Status</span><select className="input-base" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></label>
        <label><span className="label">Socials JSON</span><textarea className="input-base" rows={3} value={form.socials_text} onChange={(e) => setForm({ ...form, socials_text: e.target.value })} placeholder={'{"facebook":"https://..."}'} /></label>

        <div className="lg:col-span-3 flex gap-3">
          <button type="submit" className="btn-primary" disabled={saving}><Save size={14} /> {saving ? "Saving…" : view === "edit" ? "Update Creator" : "Create Creator"}</button>
          <button type="button" onClick={goToList} className="btn-secondary">Cancel</button>
        </div>
      </form>
      )}

      {view === "list" && (
      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal min-w-[1100px]">
          <thead><tr><th>Profile</th><th>Slug</th><th>Owner</th><th>Status</th><th>Publishing</th><th>Subscription</th><th>Commission</th><th>Link user</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} data-testid={`admin-creator-row-${b.id}`}>
                <td><div className="font-bold">{b.name}</div><div className="text-xs text-[var(--ff-muted-text)]">{b.category || "No category"} · {b.contact_email || "No email"}</div></td>
                <td className="text-[var(--ff-muted-text)]">/{b.slug}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{b.user_id || "No linked owner"}</td>
                <td><StatusBadge status={b.status} /></td>
                <td className="text-xs text-[var(--ff-muted-text)]">
                  <div>Visibility: <span className="text-[var(--ff-card-text)]">{b.visibility || "unlisted"}</span></div>
                  <div>Gallery: <span className="text-[var(--ff-card-text)]">{b.show_on_platform_gallery ? "Yes" : "No"}</span></div>
                  <div>Indexing: <span className="text-[var(--ff-card-text)]">{b.allow_search_indexing ? "Yes" : "No"}</span></div>
                </td>
                <td><StatusBadge status={b.subscription_status} /></td>
                <td>
                  {b.platform_commission_rate_percent !== undefined && b.platform_commission_rate_percent !== null
                    ? `${Number(b.platform_commission_rate_percent || 0).toFixed(2)}%`
                    : Number(b.commission_rate ?? 0.15) !== 0.15
                    ? `${Number((b.commission_rate ?? 0.15) * 100).toFixed(2)}%`
                    : "15.00% default"}
                </td>
                <td><select className="input-base py-1 text-xs" defaultValue="" onChange={(e) => linkUser(b, e.target.value)}><option value="">Link user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></td>
                <td className="text-right whitespace-nowrap"><button type="button" onClick={() => navigate(`${basePath}/creators/accounts/${b.id}`)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold mr-4">Edit</button><button type="button" onClick={() => remove(b)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold">Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-[var(--ff-muted-text)] overline">No creators yet</td></tr>}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function CreatorAccountEditRoute({ basePath = "/admin" }) {
  const { id } = useParams();
  return <BandsAdmin view="edit" creatorId={id} basePath={basePath} />;
}

function ProductsAdmin() {
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

export default function AdminCreatorsWorkspace({ modules = {}, user = null, mode = "admin", basePath = "/admin" }) {
  const root = `${basePath}/creators`;
  const tabs = useMemo(() => visibleCreatorTabs({ modules, user, mode, root }), [mode, modules, root, user]);

  const canAccounts = canAccessCreatorRoute({ permission: "manage_bands", modules, user, mode });
  const canUsers = canAccessCreatorRoute({ permission: "manage_band_users", modules, user, mode });
  const canProducts = canAccessCreatorRoute({ permission: "manage_products", modules, user, mode });
  const canArtwork = canAccessCreatorRoute({ permission: "manage_artwork_review", moduleKey: "artwork_review_enabled", modules, user, mode });
  const canSubscriptions = canAccessCreatorRoute({ permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"], modules, user, mode });
  const canPayouts = canAccessCreatorRoute({ permission: "manage_payouts", moduleKey: "payouts_enabled", modules, user, mode });
  const fallback = tabs[0]?.to || basePath;

  return (
    <div data-testid="admin-creators-workspace-routed" className="space-y-6">
      <div>
        <p className="overline mb-2">Accounts</p>
        <h1 className="font-display text-5xl uppercase">Creators</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Creator accounts, users, products, artwork review, subscriptions and payouts now own concrete routes while remaining API-backed.</p>
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
        {canAccounts && <Route path="accounts" element={<BandsAdmin view="list" basePath={basePath} />} />}
        {canAccounts && <Route path="accounts/new" element={<BandsAdmin view="new" basePath={basePath} />} />}
        {canAccounts && <Route path="accounts/:id" element={<CreatorAccountEditRoute basePath={basePath} />} />}
        {canUsers && <Route path="users" element={<UserAccessAdmin />} />}
        {canProducts && <Route path="products" element={<ProductsAdmin />} />}
        {canArtwork && <Route path="artwork" element={<ArtworkReviewAdmin />} />}
        {canSubscriptions && <Route path="subscriptions" element={<SubscriptionManagerAdmin modules={modules} />} />}
        {canPayouts && <Route path="payouts" element={<PaystackPayoutsAdmin />} />}
        <Route path="*" element={<Navigate to={fallback} replace />} />
      </Routes>
    </div>
  );
}
