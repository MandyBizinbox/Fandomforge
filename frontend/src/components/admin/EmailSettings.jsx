import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Mail, RefreshCcw, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../lib/api";

const TEMPLATE_ORDER = ["order_confirmation", "payment_confirmation", "order_status_update", "tracking_update", "internal_notification"];

function csvToList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function listToCsv(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function QueueStat({ label, value }) {
  return (
    <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-3">
      <div className="overline mb-1">{label}</div>
      <div className="font-display text-2xl">{Number(value || 0)}</div>
    </div>
  );
}

export default function EmailSettings() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [activeTemplate, setActiveTemplate] = useState("order_confirmation");

  const templates = useMemo(() => form?.templates || {}, [form]);
  const status = form?.status || {};
  const queue = status.queue || {};

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get("/admin/smtp-settings");
      const data = res.data || {};
      setForm({
        ...data,
        smtp_password: "",
        clear_password: false,
        order_notification_emails_csv: listToCsv(data.order_notification_emails),
        admin_notification_emails_csv: listToCsv(data.admin_notification_emails),
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not load SMTP settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setTemplate = (key, field, value) => setForm((current) => ({
    ...current,
    templates: {
      ...(current.templates || {}),
      [key]: { ...((current.templates || {})[key] || {}), [field]: value },
    },
  }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await http.patch("/admin/smtp-settings", {
        enabled: !!form.enabled,
        smtp_host: form.smtp_host || "",
        smtp_port: Number(form.smtp_port || 587),
        smtp_username: form.smtp_username || "",
        smtp_password: form.smtp_password || "",
        clear_password: !!form.clear_password,
        smtp_use_tls: !!form.smtp_use_tls,
        smtp_use_ssl: !!form.smtp_use_ssl,
        from_email: form.from_email || "",
        from_name: form.from_name || "",
        reply_to_email: form.reply_to_email || "",
        order_notification_emails: csvToList(form.order_notification_emails_csv),
        admin_notification_emails: csvToList(form.admin_notification_emails_csv),
        templates: form.templates || {},
      });
      const data = res.data || {};
      setForm({
        ...data,
        smtp_password: "",
        clear_password: false,
        order_notification_emails_csv: listToCsv(data.order_notification_emails),
        admin_notification_emails_csv: listToCsv(data.admin_notification_emails),
      });
      toast.success("SMTP settings saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save SMTP settings");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter a test recipient email");
      return;
    }
    setTesting(true);
    try {
      await http.post("/admin/smtp-settings/test", { recipient_email: testEmail.trim() });
      toast.success("SMTP test email sent");
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "SMTP test failed");
    } finally {
      setTesting(false);
    }
  };

  const sendQueued = async () => {
    setProcessing(true);
    try {
      const res = await http.post("/admin/smtp-settings/process-queue");
      toast.success(`Processed ${res.data?.total || 0}: ${res.data?.sent || 0} sent, ${res.data?.failed || 0} failed`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not process queued emails");
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !form) return <div className="overline">Loading SMTP settings…</div>;

  const currentTemplate = templates[activeTemplate] || {};
  const ready = Boolean(status.configured);

  return (
    <div className="space-y-6" data-testid="admin-email-settings">
      <section className={`card ${ready ? "border-[#34C759]/50" : "border-[var(--ff-primary)]/60"}`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="flex gap-3 items-start">
            {ready ? <CheckCircle2 className="text-[#34C759] shrink-0" /> : <TriangleAlert className="text-[var(--ff-primary)] shrink-0" />}
            <div>
              <p className="overline mb-2">Delivery status</p>
              <h2 className="font-display text-3xl uppercase">{ready ? "Outgoing email is active" : "SMTP setup required"}</h2>
              <p className="text-sm text-[var(--ff-muted-text)] mt-2 max-w-3xl">
                {ready
                  ? `Email is being delivered through ${status.provider || "SMTP"} using ${status.smtp_host || form.smtp_host}.`
                  : "Notifications are stored safely, but customer and operational emails remain queued until SMTP is enabled and tested."}
              </p>
              <p className="text-xs text-[var(--ff-muted-text)] mt-2">
                Source: {status.source || "dashboard"}
                {status.last_test_at ? ` · Last test: ${new Date(status.last_test_at).toLocaleString()} (${status.last_test_status || "unknown"})` : ""}
              </p>
              {status.last_test_error && <p className="text-xs text-[var(--ff-primary)] mt-2">{status.last_test_error}</p>}
            </div>
          </div>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            <RefreshCcw size={14} /> Refresh status
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <QueueStat label="Queued" value={queue.queued} />
          <QueueStat label="Retrying" value={queue.retry} />
          <QueueStat label="Sending" value={queue.sending} />
          <QueueStat label="Sent" value={queue.sent} />
          <QueueStat label="Failed" value={queue.failed} />
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 space-y-4">
          <div>
            <p className="overline mb-2">SMTP delivery</p>
            <h2 className="font-display text-3xl uppercase">Outgoing email settings</h2>
            <p className="text-[var(--ff-muted-text)] text-sm mt-2">
              Owner and administrator access only. The SMTP password is encrypted at rest and is never returned to the browser.
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 border border-[var(--ff-card-border)] p-4">
            <span>
              <span className="font-bold block">Enable email sending</span>
              <span className="text-xs text-[var(--ff-muted-text)]">When disabled, email stays queued without consuming retry attempts.</span>
            </span>
            <input type="checkbox" checked={!!form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          </label>

          <div className="grid md:grid-cols-2 gap-4">
            <Input label="SMTP host" value={form.smtp_host} onChange={(v) => set("smtp_host", v)} placeholder="smtp.example.co.za" />
            <Input label="SMTP port" type="number" value={form.smtp_port} onChange={(v) => set("smtp_port", v)} placeholder="587" />
            <Input label="SMTP username" value={form.smtp_username} onChange={(v) => set("smtp_username", v)} />
            <Input
              label={`SMTP password${form.password_configured ? " (configured)" : ""}`}
              type="password"
              value={form.smtp_password}
              onChange={(v) => set("smtp_password", v)}
              placeholder={form.password_configured ? "Leave blank to keep current password" : "Password"}
            />
            <Input label="From email" type="email" value={form.from_email} onChange={(v) => set("from_email", v)} />
            <Input label="From name" value={form.from_name} onChange={(v) => set("from_name", v)} />
            <Input label="Reply-to email" type="email" value={form.reply_to_email} onChange={(v) => set("reply_to_email", v)} />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.smtp_use_tls}
                onChange={(e) => {
                  set("smtp_use_tls", e.target.checked);
                  if (e.target.checked) set("smtp_use_ssl", false);
                }}
              />
              Use STARTTLS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.smtp_use_ssl}
                onChange={(e) => {
                  set("smtp_use_ssl", e.target.checked);
                  if (e.target.checked) set("smtp_use_tls", false);
                }}
              />
              Use SSL
            </label>
            {form.password_configured && (
              <label className="flex items-center gap-2 text-sm text-[var(--ff-muted-text)]">
                <input type="checkbox" checked={!!form.clear_password} onChange={(e) => set("clear_password", e.target.checked)} />
                Clear saved password
              </label>
            )}
          </div>
        </div>

        <div className="card space-y-4">
          <div>
            <p className="overline mb-2">Test & queue</p>
            <h2 className="font-display text-2xl uppercase">Verify delivery</h2>
          </div>
          <Input label="Test recipient" type="email" value={testEmail} onChange={setTestEmail} placeholder="you@example.co.za" />
          <button type="button" className="btn-secondary w-full" onClick={sendTest} disabled={testing || !ready}>
            <Send size={14} /> {testing ? "Sending test…" : "Send test email"}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={sendQueued} disabled={processing || !ready}>
            <Mail size={14} /> {processing ? "Processing queue…" : "Retry queued / failed emails"}
          </button>
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4 text-xs text-[var(--ff-muted-text)]">
            <ShieldCheck size={16} className="mb-2" />
            Save the SMTP settings first, then send a test email. A successful test confirms connectivity, authentication and sender permissions.
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <p className="overline mb-2">Recipients</p>
          <h2 className="font-display text-3xl uppercase">Internal email copies</h2>
          <p className="text-[var(--ff-muted-text)] text-sm mt-2">Use comma-separated email addresses for operational and administrative copies.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Input label="Order notification emails" value={form.order_notification_emails_csv} onChange={(v) => set("order_notification_emails_csv", v)} placeholder="orders@example.co.za, manager@example.co.za" />
          <Input label="Admin notification emails" value={form.admin_notification_emails_csv} onChange={(v) => set("admin_notification_emails_csv", v)} placeholder="admin@example.co.za" />
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <p className="overline mb-2">Email wording</p>
          <h2 className="font-display text-3xl uppercase">Templates</h2>
          <p className="text-[var(--ff-muted-text)] text-sm mt-2">
            Available variables include: {"{platform_name}"}, {"{customer_name}"}, {"{order_number}"}, {"{order_total}"}, {"{order_status}"}, {"{tracking_number}"}, {"{tracking_url}"}, {"{notification_title}"}, {"{notification_message}"}, {"{link_url}"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_ORDER.map((key) => (
            <button key={key} type="button" onClick={() => setActiveTemplate(key)} className={`px-3 py-2 border text-xs uppercase tracking-widest ${activeTemplate === key ? "border-[var(--ff-primary)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>
              {(templates[key]?.label || key).replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <Input label="Subject" value={currentTemplate.subject || ""} onChange={(v) => setTemplate(activeTemplate, "subject", v)} />
        <div>
          <label className="label">Body</label>
          <textarea className="input-base min-h-[220px] font-mono text-xs" value={currentTemplate.body || ""} onChange={(e) => setTemplate(activeTemplate, "body", e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save SMTP settings"}
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input-base" type={type} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
