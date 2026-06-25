import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, ExternalLink, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../lib/api";

function asNotificationPayload(data) {
  return {
    items: Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [],
    unread_count: Number(data?.unread_count || 0),
  };
}

function formatAge(value) {
  if (!value) return "";
  try {
    const created = new Date(value).getTime();
    const diff = Math.max(0, Date.now() - created);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return "";
  }
}

export default function NotificationBell({
  endpoint,
  path,
  pollMs = 30000,
  testidPrefix = "notifications",
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const hasLoadedOnce = useRef(false);
  const previousUnread = useRef(0);
  const base = useMemo(() => String(endpoint || "").replace(/\/+$/, ""), [endpoint]);

  const load = async ({ silent = false } = {}) => {
    if (!base) return;
    if (!silent) setLoading(true);

    try {
      const r = await http.get(`${base}?unread=false&limit=8`);
      const payload = asNotificationPayload(r.data);
      const unread = payload.unread_count;
      const newestUnread = payload.items.find((item) => !item.read);

      setItems(payload.items);
      setUnreadCount(unread);

      if (hasLoadedOnce.current && unread > previousUnread.current && newestUnread) {
        toast(newestUnread.title || "New notification", {
          description: newestUnread.message || "You have a new workflow update.",
          action: newestUnread.link_url
            ? {
                label: "Open",
                onClick: () => {
                  window.location.href = newestUnread.link_url;
                },
              }
            : undefined,
        });
      }

      previousUnread.current = unread;
      hasLoadedOnce.current = true;
    } catch (e) {
      if (!silent) toast.error(e.response?.data?.detail || "Could not load notifications");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load({ silent: true });
    const timer = window.setInterval(() => load({ silent: true }), pollMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, pollMs]);

  useEffect(() => {
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const markAllRead = async () => {
    if (!base || unreadCount === 0) return;
    try {
      await http.post(`${base}/read-all`);
      setItems((rows) => rows.map((row) => ({ ...row, read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
      previousUnread.current = 0;
      toast.success("Notifications marked as read");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not mark notifications read");
    }
  };

  const markRead = async (item) => {
    if (!base || !item || item.read) return;
    try {
      await http.patch(`${base}/${item.id}`, { read: true });
      setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, read: true, read_at: new Date().toISOString() } : row)));
      setUnreadCount((count) => Math.max(0, count - 1));
      previousUnread.current = Math.max(0, previousUnread.current - 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update notification");
    }
  };

  return (
    <div className="relative" data-testid={`${testidPrefix}-bell`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`relative inline-flex items-center gap-2 border px-3 py-2 text-xs uppercase tracking-widest font-bold transition-colors ${
          unreadCount > 0
            ? "border-[var(--ff-primary)]/60 bg-[var(--ff-primary)]/10 text-[var(--ff-card-text)]"
            : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:border-[var(--ff-card-border)] hover:text-[var(--ff-card-text)]"
        }`}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell size={15} />
        <span className="hidden md:inline">Alerts</span>
        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 min-w-5 h-5 rounded-full bg-[var(--ff-primary)] text-[var(--ff-card-text)] text-[10px] leading-5 text-center font-bold shadow-lg shadow-[#FF3B30]/30">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 w-[min(420px,calc(100vw-2rem))] border border-[var(--ff-card-border)] bg-[#0D0D0D] shadow-2xl shadow-black/60" data-testid={`${testidPrefix}-dropdown`}>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--ff-card-border)] p-4">
            <div>
              <div className="overline">Notifications</div>
              <div className="text-xs text-[var(--ff-muted-text)]">{unreadCount} unread</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => load()} className="text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]" disabled={loading} title="Refresh">
                <RefreshCcw size={15} />
              </button>
              <button type="button" onClick={markAllRead} className="text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]" disabled={unreadCount === 0} title="Mark all read">
                <CheckCheck size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-white/10">
            {items.length === 0 ? (
              <div className="p-6 text-center text-[var(--ff-muted-text)] text-sm">No notifications yet.</div>
            ) : (
              items.slice(0, 8).map((item) => {
                const content = (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {!item.read && <span className="h-2 w-2 rounded-full bg-[var(--ff-primary)] shrink-0" />}
                      <div className={`text-sm font-bold truncate ${item.read ? "text-[var(--ff-muted-text)]" : "text-[var(--ff-card-text)]"}`}>{item.title}</div>
                      <span className="text-[10px] text-[var(--ff-muted-text)] ml-auto shrink-0">{formatAge(item.created_at)}</span>
                    </div>
                    {item.message && <div className="text-xs text-[var(--ff-muted-text)] line-clamp-2">{item.message}</div>}
                    {item.related_order_number && <div className="text-[10px] text-[var(--ff-muted-text)] font-mono mt-1">{item.related_order_number}</div>}
                  </div>
                );

                return item.link_url ? (
                  <Link
                    key={item.id}
                    to={item.link_url}
                    onClick={() => {
                      markRead(item);
                      setOpen(false);
                    }}
                    className={`flex gap-3 p-4 hover:bg-[var(--ff-surface-bg)] ${item.read ? "bg-transparent" : "bg-[var(--ff-primary)]/5"}`}
                  >
                    {content}
                    <ExternalLink size={13} className="text-[var(--ff-muted-text)] mt-1 shrink-0" />
                  </Link>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => markRead(item)}
                    className={`w-full text-left flex gap-3 p-4 hover:bg-[var(--ff-surface-bg)] ${item.read ? "bg-transparent" : "bg-[var(--ff-primary)]/5"}`}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>

          {path && (
            <Link
              to={path}
              onClick={() => setOpen(false)}
              className="block border-t border-[var(--ff-card-border)] p-4 text-center text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)] hover:bg-[var(--ff-primary)] hover:text-[var(--ff-card-text)]"
            >
              View all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
