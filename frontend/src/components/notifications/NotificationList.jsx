import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { Bell, CheckCheck, CheckCircle2, ExternalLink, Mail, RefreshCcw, TriangleAlert } from "lucide-react";

function typeLabel(type) {
  if (type === "artwork") return "Artwork";
  if (type === "production") return "Production";
  if (type === "order") return "Order";
  if (type === "payment") return "Payment";
  if (type === "note") return "Note";
  if (type === "pricing") return "Pricing";
  return "System";
}

function typeClass(type) {
  if (type === "artwork") return "border-[#AF52DE]/40 text-[#AF52DE]";
  if (type === "production") return "border-[var(--ff-primary)] text-[var(--ff-primary)]";
  if (type === "order") return "border-[#34C759]/40 text-[#34C759]";
  if (type === "payment") return "border-[#007AFF]/40 text-[#007AFF]";
  if (type === "note") return "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]";
  return "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]";
}

function fmtDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function NotificationList({ endpoint, title = "Notifications", subtitle = "Recent updates and workflow alerts" }) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [emailStatus, setEmailStatus] = useState(null);

  const base = endpoint.replace(/\/+$/, "");
  const mayManageEmail = base.startsWith("/admin/");

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get(`${base}?unread=${filter === "unread" ? "true" : "false"}&limit=150`);
      setItems(Array.isArray(r.data?.items) ? r.data.items : []);
      setUnreadCount(Number(r.data?.unread_count || 0));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not load notifications");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, filter]);

  useEffect(() => {
    if (!mayManageEmail) return;
    http.get("/admin/smtp-settings/status")
      .then((response) => setEmailStatus(response.data || null))
      .catch(() => setEmailStatus(null));
  }, [mayManageEmail]);

  const visibleItems = useMemo(() => {
    if (filter === "unread") return items.filter((item) => !item.read);
    return items;
  }, [items, filter]);

  const markRead = async (item, read = true) => {
    try {
      await http.patch(`${base}/${item.id}`, { read });
      setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, read, read_at: read ? new Date().toISOString() : null } : row)));
      if (read && !item.read) setUnreadCount((count) => Math.max(0, count - 1));
      if (!read && item.read) setUnreadCount((count) => count + 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update notification");
    }
  };

  const markAllRead = async () => {
    try {
      await http.post(`${base}/read-all`);
      setItems((rows) => rows.map((row) => ({ ...row, read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
      toast.success("Notifications marked as read");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not mark all as read");
    }
  };

  return (
    <div className="space-y-6" data-testid="notification-list">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="overline mb-2">Communication</p>
          <h1 className="font-display text-5xl uppercase mb-2">{title}</h1>
          <p className="text-[var(--ff-muted-text)] text-sm">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] px-4 py-3">
            <div className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">Unread</div>
            <div className="font-display text-3xl text-[var(--ff-primary)]">{unreadCount}</div>
          </div>
          <button type="button" onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCcw size={14} /> Refresh
          </button>
          <button type="button" onClick={markAllRead} className="btn-primary" disabled={unreadCount === 0}>
            <CheckCheck size={14} /> Mark all read
          </button>
        </div>
      </div>

      {emailStatus && (
        <div className={`card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${emailStatus.configured ? "border-[#34C759]/40" : "border-[var(--ff-primary)]/60"}`}>
          <div className="flex items-start gap-3">
            {emailStatus.configured
              ? <CheckCircle2 size={18} className="mt-0.5 text-[#34C759] shrink-0" />
              : <TriangleAlert size={18} className="mt-0.5 text-[var(--ff-primary)] shrink-0" />}
            <div>
              <p className="font-bold">{emailStatus.configured ? "Email delivery is active" : "Email delivery needs SMTP setup"}</p>
              <p className="text-xs text-[var(--ff-muted-text)] mt-1">
                {emailStatus.configured
                  ? `Sending through ${emailStatus.provider || "SMTP"}. ${Number(emailStatus.queue?.queued || 0)} queued, ${Number(emailStatus.queue?.failed || 0)} failed.`
                  : "Platform notifications are recorded, but outgoing email remains queued until an owner or administrator completes SMTP setup."}
              </p>
            </div>
          </div>
          <Link to="/admin/shop-settings" className="btn-secondary shrink-0">
            <Mail size={14} /> Email / SMTP settings
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {["all", "unread"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 border text-xs uppercase tracking-widest font-bold ${filter === tab ? "bg-white text-black border-white" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}
          >
            {tab === "all" ? "All" : "Unread"}
          </button>
        ))}
      </div>

      <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)]">
        {loading ? (
          <div className="p-10 text-center text-[var(--ff-muted-text)] overline">Loading notifications…</div>
        ) : visibleItems.length === 0 ? (
          <div className="p-10 text-center text-[var(--ff-muted-text)]">
            <Bell className="mx-auto mb-3 text-[var(--ff-muted-text)]" size={36} />
            <div className="overline">No notifications</div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {visibleItems.map((item) => (
              <div key={item.id} className={`p-5 ${item.read ? "bg-transparent" : "bg-[var(--ff-primary)]/5"}`} data-testid={`notification-${item.id}`}>
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex border px-2 py-1 text-[10px] uppercase tracking-widest font-bold ${typeClass(item.type)}`}>
                        {typeLabel(item.type)}
                      </span>
                      {!item.read && <span className="inline-flex bg-[var(--ff-primary)] text-[var(--ff-card-text)] px-2 py-1 text-[10px] uppercase tracking-widest font-bold">Unread</span>}
                      {item.related_order_number && <span className="text-xs text-[var(--ff-muted-text)] font-mono">{item.related_order_number}</span>}
                    </div>
                    <h3 className="font-display text-2xl uppercase">{item.title}</h3>
                    {item.message && <p className="text-[var(--ff-muted-text)] text-sm mt-2 max-w-3xl">{item.message}</p>}
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[var(--ff-muted-text)]">
                      <span>{fmtDate(item.created_at)}</span>
                      {item.related_product_title && <span>Product: {item.related_product_title}</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {item.link_url && (
                      <Link to={item.link_url} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold border border-[var(--ff-primary)]/30 px-3 py-2 hover:bg-[var(--ff-primary)] hover:text-[var(--ff-card-text)]">
                        Open <ExternalLink size={12} className="inline ml-1" />
                      </Link>
                    )}
                    <button type="button" onClick={() => markRead(item, !item.read)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)] border border-[var(--ff-card-border)] px-3 py-2">
                      {item.read ? "Mark unread" : "Mark read"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
