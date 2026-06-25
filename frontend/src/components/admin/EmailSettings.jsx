import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { http } from "../../lib/api";

const TEMPLATE_ORDER = ["order_confirmation", "payment_confirmation", "order_status_update", "tracking_update", "internal_notification"];

function csvToList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function listToCsv(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

export default function EmailSettings() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [activeTemplate, setActiveTemplate] = useState("order_confirmation");

  const templates = useMemo(() => form?.templates || {}, [form]);

  const load = () => {
    setLoading(true);
    http.get("/admin/email-settings")
      .then((res) => {
        const data = res.data || {};
        setForm({
          ...data,
          order_notification_emails_csv: listToCsv(data.order_notification_emails),
          admin_notification_emails_csv: listToCsv(data.admin_notification_emails),
        });
      })
      .catch((err) => toast.error(err.response?.data?.detail || "Could not load email settings"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
      const payload = {
        enabled: !!form.enabled,
        smtp_host: form.smtp_host || "",
        smtp_port: Number(form.smtp_port || 587),
        smtp_username: form.smtp_username || "",
        smtp_password: form.smtp_password || "",
        smtp_use_tls: !!form.smtp_use_tls,
        smtp_use_ssl: !!form.smtp_use_ssl,
        from_email: form.from_email || "",
        from_name: form.from_name || "",
        reply_to_email: form.reply_to_email || "",
        order_notification_emails: csvToList(form.order_notification_emails_csv),
        admin_notification_emails: csvToList(form.admin_notification_emails_csv),
        templates: form.templates || {},
      };
      const res = await http.patch("/admin/email-settings", payload);
      const data = res.data || {};
      setForm({
        ...data,
        order_notification_emails_csv: listToCsv(data.order_notification_emails),
        admin_notification_emails_csv: listToCsv(data.admin_notification_emails),
      });
      toast.success("Email settings saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save email settings");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail.trim()) return toast.error("Enter a test recipient email");
    try {
      await http.post("/admin/email-settings/test", { recipient_email: testEmail.trim() });
      toast.success("Test email sent");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Test email failed");
    }
  };

  const sendQueued = async () => {
    try {
      const res = await http.post("/admin/notification-emails/send-queued");
      toast.success(`Processed ${res.data?.total || 0}: ${res.data?.sent || 0} sent, ${res.data?.failed || 0} failed`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not process queued emails");
    }
  };

  if (loading || !form) return <div className="overline">Loading email settings…</div>;

  const currentTemplate = templates[activeTemplate] || {};

  return (
    <div className="space-y-6" data-testid="admin-email-settings">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 space-y-4">
          <div>
            <p className="overline mb-2">SMTP delivery</p>
            <h2 className="font-display text-3xl uppercase">Outgoing email settings</h2>
            <p className="text-[var(--ff-muted-text)] text-sm mt-2">Order confirmations, payment notices and internal notifications are sent through this SMTP account.</p>
          </div>
          <label className="flex items-center justify-between gap-3 border border-[var(--ff-card-border)] p-4">
            <span><span className="font-bold block">Enable email sending</span><span className="text-xs text-[var(--ff-muted-text)]">When disabled, emails stay in the notification email log as queued.</span></span>
            <input type="checkbox" checked={!!form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          </label>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="SMTP host" value={form.smtp_host} onChange={(v) => set("smtp_host", v)} placeholder="smtp.example.co.za" />
            <Input label="SMTP port" type="number" value={form.smtp_port} onChange={(v) => set("smtp_port", v)} placeholder="587" />
            <Input label="SMTP username" value={form.smtp_username} onChange={(v) => set("smtp_username", v)} />
            <Input label={`SMTP password${form.password_configured ? " (configured)" : ""}`} type="password" value={form.smtp_password === "********" ? "" : form.smtp_password} onChange={(v) => set("smtp_password", v)} placeholder={form.password_configured ? "Leave blank to keep current password" : "Password"} />
            <Input label="From email" type="email" value={form.from_email} onChange={(v) => set("from_email", v)} />
            <Input label="From name" value={form.from_name} onChange={(v) => set("from_name", v)} />
            <Input label="Reply-to email" type="email" value={form.reply_to_email} onChange={(v) => set("reply_to_email", v)} />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.smtp_use_tls} onChange={(e) => set("smtp_use_tls", e.target.checked)} /> Use STARTTLS</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.smtp_use_ssl} onChange={(e) => set("smtp_use_ssl", e.target.checked)} /> Use SSL</label>
          </div>
        </div>
        <div className="card space-y-4">
          <div>
            <p className="overline mb-2">Tools</p>
            <h2 className="font-display text-2xl uppercase">Test & queue</h2>
          </div>
          <Input label="Test recipient" type="email" value={testEmail} onChange={setTestEmail} placeholder="you@example.co.za" />
          <button type="button" className="btn-secondary w-full" onClick={sendTest}>Send test email</button>
          <button type="button" className="btn-secondary w-full" onClick={sendQueued}>Send queued / failed emails</button>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <p className="overline mb-2">Recipients</p>
          <h2 className="font-display text-3xl uppercase">Internal email copies</h2>
          <p className="text-[var(--ff-muted-text)] text-sm mt-2">Use comma-separated email addresses. These fields are stored now so notification routing can be expanded without another settings rebuild.</p>
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
          <p className="text-[var(--ff-muted-text)] text-sm mt-2">Available variables include: {"{platform_name}"}, {"{customer_name}"}, {"{order_number}"}, {"{order_total}"}, {"{order_status}"}, {"{tracking_number}"}, {"{tracking_url}"}, {"{notification_title}"}, {"{notification_message}"}, {"{link_url}"}.</p>
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
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save email settings"}</button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return <div><label className="label">{label}</label><input className="input-base" type={type} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}
