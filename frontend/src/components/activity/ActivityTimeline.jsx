import React, { useEffect, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";

function formatKind(kind) {
  return String(kind || "system").replace(/_/g, " ");
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function eventTone(kind) {
  if (kind === "internal_note") return "border-[var(--ff-primary)]";
  if (kind === "production_status_changed") return "border-[#34C759]/50";
  if (kind === "printer_assigned") return "border-blue-400/50";
  if (kind === "tracking_updated") return "border-purple-400/50";
  return "border-[var(--ff-card-border)]";
}

export default function ActivityTimeline({ orderId, endpoint, title = "Timeline", canAddNote = true, defaultAudience = ["admin"] }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [audience, setAudience] = useState(defaultAudience);
  const [saving, setSaving] = useState(false);

  const resolvedEndpoint = endpoint || (orderId ? `/orders/${orderId}/timeline` : null);

  const load = () => {
    if (!resolvedEndpoint) return Promise.resolve();
    setLoading(true);
    return http
      .get(resolvedEndpoint)
      .then((response) => setEvents(Array.isArray(response.data) ? response.data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEndpoint]);

  const toggleAudience = (value) => {
    setAudience((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      return [...current, value];
    });
  };

  const addNote = async () => {
    if (!orderId || !note.trim()) return;
    setSaving(true);
    try {
      await http.post(`/orders/${orderId}/notes`, {
        message: note.trim(),
        audience: audience.length ? audience : defaultAudience,
      });
      setNote("");
      toast.success("Note added");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" data-testid="activity-timeline">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="overline mb-1">Activity</div>
          <h3 className="font-display text-2xl uppercase">{title}</h3>
        </div>
        <button type="button" onClick={load} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)] font-bold">
          Refresh
        </button>
      </div>

      {canAddNote && orderId && (
        <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 mb-4">
          <label className="label">Add internal note</label>
          <textarea
            className="input-base text-sm"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add production note, customer update, printer instruction..."
          />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {['admin', 'creator', 'printer'].map((item) => (
              <label key={item} className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">
                <input type="checkbox" checked={audience.includes(item)} onChange={() => toggleAudience(item)} />
                {item}
              </label>
            ))}
            <button type="button" onClick={addNote} disabled={saving || !note.trim()} className="btn-primary text-xs ml-auto">
              {saving ? "Saving..." : "Add Note"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="overline text-[var(--ff-muted-text)]">Loading activity...</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-[var(--ff-muted-text)]">No activity recorded yet.</div>
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
          {events.map((event) => (
            <div key={event.id} className={`border ${eventTone(event.kind)} bg-[var(--ff-surface-bg)] p-3`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-sm">{event.title}</div>
                  <div className="overline mt-1 text-[var(--ff-muted-text)]">{formatKind(event.kind)}</div>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)] text-right whitespace-nowrap">
                  {formatDate(event.created_at)}
                </div>
              </div>
              {event.message && <p className="text-sm text-[var(--ff-muted-text)] mt-2 whitespace-pre-wrap">{event.message}</p>}
              {(event.product_title || event.order_number) && (
                <div className="text-xs text-[var(--ff-muted-text)] mt-2">
                  {event.order_number && <span>Order {event.order_number}</span>}
                  {event.product_title && <span>{event.order_number ? " · " : ""}{event.product_title}</span>}
                </div>
              )}
              {Array.isArray(event.audience) && event.audience.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {event.audience.map((item) => (
                    <span key={item} className="text-[10px] uppercase tracking-widest border border-[var(--ff-card-border)] px-2 py-1 text-[var(--ff-muted-text)]">{item}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
