import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Upload } from "lucide-react";
import { assetUrl, http } from "../../lib/api";
import RichTextEditor from "../RichTextEditor";
import RichTextRenderer from "../RichTextRenderer";

const policyFields = [
  ["terms_and_conditions", "Terms and Conditions"],
  ["privacy_policy", "Privacy Policy"],
  ["returns_policy", "Returns Policy"],
  ["shipping_policy", "Shipping Policy"],
  ["creator_terms", "Creator Terms"],
  ["printer_terms", "Printer Terms"],
];

const sectionTypes = [
  ["hero", "Hero"],
  ["rich_text", "Rich Text"],
  ["feature_grid", "Feature Grid"],
  ["how_it_works", "How It Works"],
  ["audience_cards", "Audience Cards"],
  ["cta_banner", "CTA Banner"],
  ["image_text", "Image + Text"],
  ["faq", "FAQ"],
  ["featured_products", "Featured Products"],
  ["featured_creators", "Featured Creators"],
];

function uid() {
  return `section-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder = "" }) {
  return <input className="input-base" value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function normalisePickerColour(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  return "";
}

const colourPresets = [
  "#000000",
  "#111111",
  "#ffffff",
  "#edebeb",
  "#ff8c01",
  "#c62c2c",
  "#05c0fe",
  "#22c55e",
  "#6b7280",
];

function ColorInput({ value, onChange, placeholder = "Auto", allowAuto = false }) {
  const pickerValue = normalisePickerColour(value) || "#000000";

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] px-3 py-2 min-w-[112px]">
          <input
            type="color"
            value={pickerValue}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 cursor-pointer border border-[var(--ff-card-border)] bg-transparent p-0"
            title="Pick colour"
          />
          <span
            className="h-8 w-8 border border-[var(--ff-card-border)]"
            style={{ backgroundColor: normalisePickerColour(value) || "transparent" }}
            title={value || "Auto"}
          />
        </div>

        <input
          className="input-base"
          value={value || ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />

        {allowAuto && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="btn-secondary px-3 py-2 text-xs shrink-0"
          >
            Auto
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {colourPresets.map((colour) => (
          <button
            key={colour}
            type="button"
            onClick={() => onChange(colour)}
            className="h-6 w-6 border border-[var(--ff-card-border)] hover:border-white"
            style={{ backgroundColor: colour }}
            title={colour}
            aria-label={`Use ${colour}`}
          />
        ))}
      </div>
    </div>
  );
}

function TextArea({ value, onChange, rows = 4, placeholder = "" }) {
  return <textarea className="input-base min-h-[120px]" rows={rows} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function ImageUploadField({
  label,
  value,
  onChange,
  subdir = "branding",
  hint = "Upload PNG, JPG, WEBP or SVG. Existing external URLs are still supported.",
  placeholder = "/api/uploads/... or https://...",
}) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subdir", subdir);
      const res = await http.post("/files/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(res.data?.url || "");
      toast.success(`${label} uploaded`);
    } catch (e) {
      toast.error(e.response?.data?.detail || `Could not upload ${label.toLowerCase()}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label={label} hint={hint}>
      <div className="space-y-3">
        {value ? (
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 flex items-center gap-4">
            <div className="w-28 h-16 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] flex items-center justify-center overflow-hidden">
              <img src={assetUrl(value)} alt={label} className="max-w-full max-h-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] mb-1">Current file</p>
              <p className="text-xs text-[var(--ff-muted-text)] break-all">{value}</p>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4 text-sm text-[var(--ff-muted-text)]">No file uploaded yet.</div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={value} onChange={onChange} placeholder={placeholder} />
          <label className={`btn-secondary cursor-pointer justify-center ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <Upload size={16} />
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
              disabled={uploading}
            />
          </label>
        </div>
      </div>
    </Field>
  );
}

function normaliseSection(section = {}, index = 0) {
  return {
    id: section.id || uid(),
    type: section.type || "rich_text",
    enabled: section.enabled !== false,
    sort_order: Number(section.sort_order || (index + 1) * 10),
    eyebrow: section.eyebrow || "",
    title: section.title || "",
    subtitle: section.subtitle || "",
    body_html: section.body_html || "",
    button_label: section.button_label || "",
    button_url: section.button_url || "",
    secondary_button_label: section.secondary_button_label || "",
    secondary_button_url: section.secondary_button_url || "",
    image_url: section.image_url || "",
    settings: section.settings && typeof section.settings === "object" ? section.settings : {},
  };
}

function createSection(type = "rich_text") {
  const base = normaliseSection({ type, id: uid(), sort_order: Date.now() }, 0);
  const copy = {
    hero: {
      eyebrow: "Featured platform",
      title: "Launch merch without the admin headache",
      subtitle: "Build a clean storefront, take orders and route fulfilment from one dashboard.",
      body_html: "<p>Use this section to introduce the platform and guide visitors to the right action.</p>",
      button_label: "Shop now",
      button_url: "/shop",
      secondary_button_label: "Start selling",
      secondary_button_url: "/register/creator",
    },
    rich_text: {
      eyebrow: "About",
      title: "Tell visitors what makes this platform different",
      body_html: "<p>Add your own copy here. You can format text, add lists and link to important pages.</p>",
    },
    feature_grid: {
      eyebrow: "Highlights",
      title: "Everything needed to sell and fulfil merch",
      settings: {
        features: [
          { title: "Creator storefronts", text: "Give each creator, club or group their own store." },
          { title: "Controlled products", text: "Use approved templates, variations and print areas." },
          { title: "Fulfilment workflow", text: "Send orders to production with artwork attached." },
        ],
      },
    },
    how_it_works: {
      eyebrow: "How it works",
      title: "Simple for sellers, clear for production",
      settings: {
        steps: [
          { title: "Create a store", text: "Set up the creator profile and choose products." },
          { title: "Sell online", text: "Buyers order through the public storefront." },
          { title: "Fulfil and track", text: "Production and dispatch are managed from the dashboard." },
        ],
      },
    },
    cta_banner: {
      eyebrow: "Ready?",
      title: "Start your merch store today",
      subtitle: "Choose a plan, create your account and begin setting up products.",
      button_label: "Create a store",
      button_url: "/register/creator",
    },
    image_text: {
      eyebrow: "Custom content",
      title: "Add an image and supporting copy",
      body_html: "<p>Use this section for a client-specific message, launch announcement or campaign details.</p>",
    },
    faq: {
      eyebrow: "Questions",
      title: "Frequently asked questions",
      settings: {
        faqs: [
          { question: "Do I need to hold stock?", answer: "No. Products can be produced after an order is placed." },
          { question: "Can I use my own payment gateway?", answer: "Yes, shop checkout gateways are configured per platform instance." },
        ],
      },
    },
    featured_products: {
      eyebrow: "Shop now",
      title: "Featured products",
      subtitle: "Show live products from the marketplace.",
      button_label: "View all products",
      button_url: "/shop",
      settings: { limit: 8 },
    },
    featured_creators: {
      eyebrow: "Browse stores",
      title: "Creator stores",
      subtitle: "Show active creators and storefronts.",
      button_label: "View creators",
      button_url: "/creators",
      settings: { limit: 6 },
    },
    audience_cards: {
      eyebrow: "For every role",
      title: "Built for buyers, creators and fulfilment teams",
      subtitle: "Show the right signup and shopping options for this platform.",
    },
  }[type] || {};

  return { ...base, ...copy, id: base.id, type, enabled: true };
}

function ListEditor({ label, value = [], onChange, fields }) {
  const rows = Array.isArray(value) ? value : [];
  const update = (index, key, next) => {
    const copy = rows.map((row) => ({ ...row }));
    copy[index] = { ...copy[index], [key]: next };
    onChange(copy);
  };
  const add = () => onChange([...rows, fields.reduce((acc, field) => ({ ...acc, [field.key]: "" }), {})]);
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="label mb-0">{label}</p>
        <button type="button" onClick={add} className="border border-[var(--ff-card-border)] px-3 py-2 text-xs uppercase tracking-widest hover:border-[var(--ff-primary)]">Add</button>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="border border-[var(--ff-card-border)] p-3 space-y-3 bg-[var(--ff-surface-bg)]">
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              {field.rich ? (
                <RichTextEditor value={row[field.key] || ""} onChange={(v) => update(index, field.key, v)} />
              ) : (
                <Input value={row[field.key] || ""} onChange={(v) => update(index, field.key, v)} />
              )}
            </Field>
          ))}
          <button type="button" onClick={() => remove(index)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)]">Remove row</button>
        </div>
      ))}
    </div>
  );
}

function SectionPreview({ section }) {
  return (
    <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5">
      {section.eyebrow && <p className="overline mb-2">{section.eyebrow}</p>}
      {section.title && <h3 className="font-display text-3xl uppercase mb-2">{section.title}</h3>}
      {section.subtitle && <p className="text-[var(--ff-muted-text)] text-sm mb-3">{section.subtitle}</p>}
      <RichTextRenderer html={section.body_html} className="text-sm text-[var(--ff-muted-text)]" />
      {(section.button_label || section.secondary_button_label) && (
        <div className="flex flex-wrap gap-2 mt-4">
          {section.button_label && <span className="btn-primary pointer-events-none">{section.button_label}</span>}
          {section.secondary_button_label && <span className="btn-secondary pointer-events-none">{section.secondary_button_label}</span>}
        </div>
      )}
    </div>
  );
}

export default function InstanceBrandingSettings() {
  const [settings, setSettings] = useState(null);
  const [plans, setPlans] = useState({ creator: [], printer: [] });
  const [tab, setTab] = useState("branding");
  const [saving, setSaving] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState(null);

  const load = () => {
    http.get("/admin/instance-settings").then((res) => setSettings(res.data)).catch((e) => toast.error(e.response?.data?.detail || "Could not load instance settings"));
    Promise.all([
      http.get("/admin/subscription-plans?audience=creator").catch(() => ({ data: [] })),
      http.get("/admin/subscription-plans?audience=printer").catch(() => ({ data: [] })),
    ]).then(([creator, printer]) => setPlans({ creator: creator.data || [], printer: printer.data || [] }));
  };

  useEffect(() => { load(); }, []);

  const sections = useMemo(() => (settings?.homepage_sections || []).map(normaliseSection).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)), [settings]);

  const patch = (key, value) => setSettings((s) => ({ ...(s || {}), [key]: value }));
  const patchNested = (group, key, value) => setSettings((s) => ({ ...(s || {}), [group]: { ...((s || {})[group] || {}), [key]: value } }));
  const patchSections = (nextSections) => patch("homepage_sections", nextSections.map((section, index) => ({ ...normaliseSection(section, index), sort_order: (index + 1) * 10 })));
  const patchSection = (id, updates) => patchSections(sections.map((section) => section.id === id ? { ...section, ...updates } : section));
  const patchSectionSetting = (id, key, value) => patchSections(sections.map((section) => section.id === id ? { ...section, settings: { ...(section.settings || {}), [key]: value } } : section));

  const addSection = (type) => {
    const next = [...sections, createSection(type)];
    patchSections(next);
    setExpandedSectionId(next[next.length - 1].id);
  };

  const duplicateSection = (section) => {
    const next = [...sections, { ...section, id: uid(), title: `${section.title || "Section"} Copy` }];
    patchSections(next);
    setExpandedSectionId(next[next.length - 1].id);
  };

  const moveSection = (id, direction) => {
    const index = sections.findIndex((section) => section.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const copy = [...sections];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    patchSections(copy);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        platform_name: settings.platform_name,
        platform_tagline: settings.platform_tagline,
        logo_url: settings.logo_url,
        favicon_url: settings.favicon_url,
        primary_color: settings.primary_color,
        accent_color: settings.accent_color,
        theme_mode: settings.theme_mode || "dark",
        background_color: settings.background_color || "#0A0A0A",
        page_text_color: settings.page_text_color || "",
        surface_background_color: settings.surface_background_color || "",
        surface_text_color: settings.surface_text_color || "",
        card_background_color: settings.card_background_color || "",
        card_text_color: settings.card_text_color || "",
        card_border_color: settings.card_border_color || "",
        muted_text_color: settings.muted_text_color || "",
        input_background_color: settings.input_background_color || "",
        input_text_color: settings.input_text_color || "",
        input_border_color: settings.input_border_color || "",
        header_background_color: settings.header_background_color || "#0A0A0A",
        header_text_color: settings.header_text_color || "#FFFFFF",
        button_primary_background_color: settings.button_primary_background_color || settings.primary_color || "#FF3B30",
        button_primary_text_color: settings.button_primary_text_color || "#FFFFFF",
        button_primary_border_color: settings.button_primary_border_color || "",
        button_alternate_background_color: settings.button_alternate_background_color || "#FFFFFF",
        button_alternate_text_color: settings.button_alternate_text_color || "#000000",
        button_alternate_border_color: settings.button_alternate_border_color || "",
        button_secondary_border_color: settings.button_secondary_border_color || "",
        support_email: settings.support_email,
        support_phone: settings.support_phone,
        support_whatsapp: settings.support_whatsapp,
        business_name: settings.business_name,
        business_registration: settings.business_registration,
        public_contact_email: settings.public_contact_email,
        public_contact_phone: settings.public_contact_phone,
        country: settings.country,
        timezone: settings.timezone,
        homepage: settings.homepage || {},
        homepage_sections: sections,
        signup: settings.signup || {},
        policies: settings.policies || {},
      };
      const res = await http.patch("/admin/instance-settings", payload);
      setSettings(res.data);
      toast.success("Instance settings saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="card text-[var(--ff-muted-text)]">Loading instance settings…</div>;

  const tabs = [
    ["branding", "Branding"],
    ["homepage", "Homepage Copy"],
    ["builder", "Homepage Builder"],
    ["signup", "Signup"],
    ["legal", "Legal"],
  ];

  return (
    <div className="space-y-6">
      <div className="card flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="overline mb-2">Instance setup</p>
          <h2 className="font-display text-3xl uppercase">Branding, homepage and public platform settings</h2>
          <p className="text-[var(--ff-muted-text)] text-sm mt-1">Control the public wording, homepage sections, signup behaviour and policy text for this deployed instance.</p>
        </div>
        <button type="button" onClick={save} className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Settings"}</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`px-4 py-2 border text-xs uppercase tracking-widest ${tab === key ? "border-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>{label}</button>)}
      </div>

      {tab === "branding" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Platform name"><Input value={settings.platform_name} onChange={(v) => patch("platform_name", v)} /></Field>
          <Field label="Tagline"><Input value={settings.platform_tagline} onChange={(v) => patch("platform_tagline", v)} /></Field>
          <ImageUploadField label="Logo" value={settings.logo_url} onChange={(v) => patch("logo_url", v)} subdir="branding/logo" hint="Used in the public navigation/header. Recommended: transparent PNG or SVG, landscape format." />
          <ImageUploadField label="Favicon" value={settings.favicon_url} onChange={(v) => patch("favicon_url", v)} subdir="branding/favicon" hint="Used as the browser icon. Recommended: square PNG/SVG, 512×512 or smaller." />
          <Field label="Primary colour"><ColorInput value={settings.primary_color} onChange={(v) => patch("primary_color", v)} placeholder="#ff8c01" /></Field>
          <Field label="Accent colour"><ColorInput value={settings.accent_color} onChange={(v) => patch("accent_color", v)} placeholder="#c62c2c" /></Field>

          <Field label="Theme mode" hint="Controls public page contrast. Use Dark for black/charcoal sites and Light for white/clean sites.">
            <select className="input-base" value={settings.theme_mode || "dark"} onChange={(e) => patch("theme_mode", e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>

          <Field label="Site background colour" hint="Main page background across all public pages. Example: #0A0A0A, #FFFFFF, #edebeb.">
            <ColorInput value={settings.background_color || "#0A0A0A"} onChange={(v) => patch("background_color", v)} placeholder="#edebeb" />
          </Field>

          <Field label="Page text colour" hint="Leave blank for automatic contrast from the background. Example override: #111111 or #FFFFFF.">
            <ColorInput value={settings.page_text_color || ""} onChange={(v) => patch("page_text_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Muted text colour" hint="Leave blank for automatic muted grey. Used for subtitles, labels and helper text.">
            <ColorInput value={settings.muted_text_color || ""} onChange={(v) => patch("muted_text_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Surface background colour" hint="Optional. Used for larger panels/surfaces. Leave blank for automatic light/dark value.">
            <ColorInput value={settings.surface_background_color || ""} onChange={(v) => patch("surface_background_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Surface text colour" hint="Optional. Leave blank for automatic contrast.">
            <ColorInput value={settings.surface_text_color || ""} onChange={(v) => patch("surface_text_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Card background colour" hint="Optional. Controls .card panels. Leave blank for automatic value.">
            <ColorInput value={settings.card_background_color || ""} onChange={(v) => patch("card_background_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Card text colour" hint="Optional. Leave blank for automatic contrast.">
            <ColorInput value={settings.card_text_color || ""} onChange={(v) => patch("card_text_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Card border colour" hint="Optional. Example: #dddddd. Leave blank for automatic value.">
            <ColorInput value={settings.card_border_color || ""} onChange={(v) => patch("card_border_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Input background colour" hint="Optional. Controls inputs/selects. Leave blank for automatic value.">
            <ColorInput value={settings.input_background_color || ""} onChange={(v) => patch("input_background_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Input text colour" hint="Optional. Controls text inside inputs/selects. Leave blank for automatic contrast.">
            <ColorInput value={settings.input_text_color || ""} onChange={(v) => patch("input_text_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Input border colour" hint="Optional. Leave blank for automatic border colour.">
            <ColorInput value={settings.input_border_color || ""} onChange={(v) => patch("input_border_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Header menu background colour" hint="Navigation/header background colour. Example: #0A0A0A, #FFFFFF, #111827.">
            <ColorInput value={settings.header_background_color || "#0A0A0A"} onChange={(v) => patch("header_background_color", v)} placeholder="#c4c4c4" />
          </Field>

          <Field label="Header menu text colour" hint="Useful when using a light header background. Example: #FFFFFF or #111111.">
            <ColorInput value={settings.header_text_color || "#FFFFFF"} onChange={(v) => patch("header_text_color", v)} placeholder="#121212" />
          </Field>

          <Field label="Button primary background colour" hint="Main CTA button background. Example: #EB6222, #111111, #000000.">
            <ColorInput value={settings.button_primary_background_color || settings.primary_color || "#FF3B30"} onChange={(v) => patch("button_primary_background_color", v)} placeholder="#05c0fe" />
          </Field>

          <Field label="Button primary text colour" hint="Text colour on the main CTA button. Example: #FFFFFF or #111111.">
            <ColorInput value={settings.button_primary_text_color || "#FFFFFF"} onChange={(v) => patch("button_primary_text_color", v)} placeholder="#000000" />
          </Field>

          <Field label="Button primary border colour" hint="Optional. Leave blank to match the primary button background.">
            <ColorInput value={settings.button_primary_border_color || ""} onChange={(v) => patch("button_primary_border_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Button alternate background colour" hint="Secondary button background and primary button hover colour. Use a dark colour for light themes.">
            <ColorInput value={settings.button_alternate_background_color || "#FFFFFF"} onChange={(v) => patch("button_alternate_background_color", v)} placeholder="#05c0fe" />
          </Field>

          <Field label="Button alternate text colour" hint="Text colour on alternate/secondary buttons. Example: #FFFFFF or #111111.">
            <ColorInput value={settings.button_alternate_text_color || "#000000"} onChange={(v) => patch("button_alternate_text_color", v)} placeholder="#000000" />
          </Field>

          <Field label="Button alternate border colour" hint="Optional. Leave blank to match the alternate button background.">
            <ColorInput value={settings.button_alternate_border_color || ""} onChange={(v) => patch("button_alternate_border_color", v)} placeholder="Auto" allowAuto />
          </Field>

          <Field label="Button secondary idle border colour" hint="Optional. Controls secondary button border before hover. Leave blank for automatic light/dark border.">
            <ColorInput value={settings.button_secondary_border_color || ""} onChange={(v) => patch("button_secondary_border_color", v)} placeholder="Auto" allowAuto />
          </Field>
          <Field label="Support email"><Input value={settings.support_email} onChange={(v) => patch("support_email", v)} /></Field>
          <Field label="Support phone"><Input value={settings.support_phone} onChange={(v) => patch("support_phone", v)} /></Field>
          <Field label="Support WhatsApp"><Input value={settings.support_whatsapp} onChange={(v) => patch("support_whatsapp", v)} /></Field>
          <Field label="Business name"><Input value={settings.business_name} onChange={(v) => patch("business_name", v)} /></Field>
          <Field label="Business registration"><Input value={settings.business_registration} onChange={(v) => patch("business_registration", v)} /></Field>
          <Field label="Public contact email"><Input value={settings.public_contact_email} onChange={(v) => patch("public_contact_email", v)} /></Field>
        </div>
      )}

      {tab === "homepage" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Fallback hero title" hint="Used when the Homepage Builder has no active hero section."><Input value={settings.homepage?.hero_title} onChange={(v) => patchNested("homepage", "hero_title", v)} /></Field>
          <Field label="Fallback hero subtitle"><TextArea value={settings.homepage?.hero_subtitle} onChange={(v) => patchNested("homepage", "hero_subtitle", v)} /></Field>
          <Field label="Buyer CTA label"><Input value={settings.homepage?.buyer_cta_label} onChange={(v) => patchNested("homepage", "buyer_cta_label", v)} /></Field>
          <Field label="Buyer CTA URL"><Input value={settings.homepage?.buyer_cta_url} onChange={(v) => patchNested("homepage", "buyer_cta_url", v)} /></Field>
          <Field label="Creator CTA label"><Input value={settings.homepage?.creator_cta_label} onChange={(v) => patchNested("homepage", "creator_cta_label", v)} /></Field>
          <Field label="Creator CTA URL"><Input value={settings.homepage?.creator_cta_url} onChange={(v) => patchNested("homepage", "creator_cta_url", v)} /></Field>
          <Field label="Printer CTA label"><Input value={settings.homepage?.printer_cta_label} onChange={(v) => patchNested("homepage", "printer_cta_label", v)} /></Field>
          <Field label="Printer CTA URL"><Input value={settings.homepage?.printer_cta_url} onChange={(v) => patchNested("homepage", "printer_cta_url", v)} /></Field>
        </div>
      )}

      {tab === "builder" && (
        <div className="space-y-6">
          <div className="card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="overline mb-2">Homepage Builder</p>
              <h3 className="font-display text-3xl uppercase">Section-based WYSIWYG editor</h3>
              <p className="text-[var(--ff-muted-text)] text-sm mt-1">Build a flexible homepage without editing code. Drag-and-drop is intentionally avoided for now; use the arrows to control section order.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select id="new-home-section-type" className="input-base max-w-[220px]">
                {sectionTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <button type="button" onClick={() => addSection(document.getElementById("new-home-section-type")?.value || "rich_text")} className="btn-primary"><Plus size={16} /> Add Section</button>
            </div>
          </div>

          {sections.length === 0 && (
            <div className="card text-[var(--ff-muted-text)]">No custom sections yet. Add a hero, rich text block or feature grid to start building this homepage.</div>
          )}

          {sections.map((section, index) => {
            const expanded = expandedSectionId === section.id;
            return (
              <div key={section.id} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)]">
                <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[var(--ff-card-border)]">
                  <div>
                    <div className="flex flex-wrap gap-2 items-center mb-2">
                      <span className="overline">{sectionTypes.find(([key]) => key === section.type)?.[1] || section.type}</span>
                      {!section.enabled && <span className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">Hidden</span>}
                    </div>
                    <h4 className="font-display text-2xl uppercase">{section.title || "Untitled section"}</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => moveSection(section.id, -1)} disabled={index === 0} className="border border-[var(--ff-card-border)] p-2 disabled:opacity-30"><ArrowUp size={16} /></button>
                    <button type="button" onClick={() => moveSection(section.id, 1)} disabled={index === sections.length - 1} className="border border-[var(--ff-card-border)] p-2 disabled:opacity-30"><ArrowDown size={16} /></button>
                    <button type="button" onClick={() => patchSection(section.id, { enabled: !section.enabled })} className="border border-[var(--ff-card-border)] px-3 py-2 text-xs uppercase tracking-widest hover:border-[var(--ff-primary)]">{section.enabled ? "Hide" : "Show"}</button>
                    <button type="button" onClick={() => duplicateSection(section)} className="border border-[var(--ff-card-border)] p-2 hover:border-[var(--ff-primary)]"><Copy size={16} /></button>
                    <button type="button" onClick={() => patchSections(sections.filter((row) => row.id !== section.id))} className="border border-[var(--ff-card-border)] p-2 hover:border-[var(--ff-primary)] text-[var(--ff-primary)]"><Trash2 size={16} /></button>
                    <button type="button" onClick={() => setExpandedSectionId(expanded ? null : section.id)} className="btn-secondary">{expanded ? "Close" : "Edit"}</button>
                  </div>
                </div>

                {expanded && (
                  <div className="p-4 grid xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-6">
                    <div className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <Field label="Section type">
                          <select className="input-base" value={section.type} onChange={(e) => patchSection(section.id, { type: e.target.value })}>
                            {sectionTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                        </Field>
                        <Field label="Eyebrow"><Input value={section.eyebrow} onChange={(v) => patchSection(section.id, { eyebrow: v })} /></Field>
                        <Field label="Title"><Input value={section.title} onChange={(v) => patchSection(section.id, { title: v })} /></Field>
                        <Field label="Subtitle"><Input value={section.subtitle} onChange={(v) => patchSection(section.id, { subtitle: v })} /></Field>
                        <Field label="Button label"><Input value={section.button_label} onChange={(v) => patchSection(section.id, { button_label: v })} /></Field>
                        <Field label="Button URL"><Input value={section.button_url} onChange={(v) => patchSection(section.id, { button_url: v })} /></Field>
                        <Field label="Secondary button label"><Input value={section.secondary_button_label} onChange={(v) => patchSection(section.id, { secondary_button_label: v })} /></Field>
                        <Field label="Secondary button URL"><Input value={section.secondary_button_url} onChange={(v) => patchSection(section.id, { secondary_button_url: v })} /></Field>
                        <ImageUploadField label="Section image" value={section.image_url} onChange={(v) => patchSection(section.id, { image_url: v })} subdir="homepage/sections" hint="Optional image for hero or image + text sections. Uploading stores the file under /api/uploads/." />
                      </div>

                      <Field label="WYSIWYG content">
                        <RichTextEditor value={section.body_html} onChange={(v) => patchSection(section.id, { body_html: v })} />
                      </Field>

                      {section.type === "feature_grid" && (
                        <ListEditor
                          label="Feature cards"
                          value={section.settings?.features || []}
                          onChange={(rows) => patchSectionSetting(section.id, "features", rows)}
                          fields={[{ key: "title", label: "Title" }, { key: "text", label: "Text" }]}
                        />
                      )}

                      {section.type === "how_it_works" && (
                        <ListEditor
                          label="Steps"
                          value={section.settings?.steps || []}
                          onChange={(rows) => patchSectionSetting(section.id, "steps", rows)}
                          fields={[{ key: "title", label: "Step title" }, { key: "text", label: "Step text" }]}
                        />
                      )}

                      {section.type === "faq" && (
                        <ListEditor
                          label="FAQs"
                          value={section.settings?.faqs || []}
                          onChange={(rows) => patchSectionSetting(section.id, "faqs", rows)}
                          fields={[{ key: "question", label: "Question" }, { key: "answer", label: "Answer", rich: true }]}
                        />
                      )}

                      {(section.type === "featured_products" || section.type === "featured_creators") && (
                        <Field label="Display limit">
                          <Input value={section.settings?.limit || ""} onChange={(v) => patchSectionSetting(section.id, "limit", Number(v || 0))} />
                        </Field>
                      )}
                    </div>
                    <div className="space-y-3">
                      <p className="label">Preview</p>
                      <SectionPreview section={section} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "signup" && (
        <div className="grid md:grid-cols-2 gap-4">
          {[["creator_signup_enabled", "Creator signup enabled"], ["printer_signup_enabled", "Printer signup enabled"], ["require_creator_approval", "Require creator approval"], ["require_printer_approval", "Require printer approval"], ["allow_manual_billing", "Allow manual billing"], ["allow_paystack_recurring_billing", "Allow Paystack recurring billing"]].map(([key, label]) => (
            <label key={key} className="card flex items-center justify-between gap-4">
              <span className="font-bold">{label}</span>
              <input type="checkbox" checked={!!settings.signup?.[key]} onChange={(e) => patchNested("signup", key, e.target.checked)} />
            </label>
          ))}
          <Field label="Default creator plan"><select className="input-base" value={settings.signup?.default_creator_plan_id || ""} onChange={(e) => patchNested("signup", "default_creator_plan_id", e.target.value)}><option value="">First active creator plan</option>{plans.creator.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Default printer plan"><select className="input-base" value={settings.signup?.default_printer_plan_id || ""} onChange={(e) => patchNested("signup", "default_printer_plan_id", e.target.value)}><option value="">First active printer plan</option>{plans.printer.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
      )}

      {tab === "legal" && (
        <div className="space-y-4">
          {policyFields.map(([key, label]) => <Field key={key} label={label}><RichTextEditor value={settings.policies?.[key]} onChange={(v) => patchNested("policies", key, v)} /></Field>)}
        </div>
      )}
    </div>
  );
}
