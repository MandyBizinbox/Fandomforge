import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { assetUrl, http } from "../../lib/api";
import RichTextEditor from "../RichTextEditor";
import RichTextRenderer from "../RichTextRenderer";

const POLICY_FIELDS = [
  ["terms_and_conditions", "Terms and Conditions"],
  ["privacy_policy", "Privacy Policy"],
  ["returns_policy", "Returns Policy"],
  ["shipping_policy", "Shipping Policy"],
  ["creator_terms", "Creator Terms"],
  ["printer_terms", "Printer Terms"],
];

const SECTION_TYPES = [
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

const COLOUR_PRESETS = ["#000000", "#111111", "#ffffff", "#edebeb", "#ff8c01", "#c62c2c", "#05c0fe", "#22c55e", "#6b7280"];

const BRAND_COLOUR_FIELDS = [
  ["primary_color", "Primary colour", false],
  ["accent_color", "Accent colour", false],
  ["background_color", "Site background colour", false],
  ["page_text_color", "Page text colour", true],
  ["muted_text_color", "Muted text colour", true],
  ["surface_background_color", "Surface background colour", true],
  ["surface_text_color", "Surface text colour", true],
  ["card_background_color", "Card background colour", true],
  ["card_text_color", "Card text colour", true],
  ["card_border_color", "Card border colour", true],
  ["input_background_color", "Input background colour", true],
  ["input_text_color", "Input text colour", true],
  ["input_border_color", "Input border colour", true],
  ["header_background_color", "Header background colour", false],
  ["header_text_color", "Header text colour", false],
  ["button_primary_background_color", "Primary button background", false],
  ["button_primary_text_color", "Primary button text", false],
  ["button_primary_border_color", "Primary button border", true],
  ["button_alternate_background_color", "Alternate button background", false],
  ["button_alternate_text_color", "Alternate button text", false],
  ["button_alternate_border_color", "Alternate button border", true],
  ["button_secondary_border_color", "Secondary button idle border", true],
];

function uid() {
  return `section-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[var(--ff-muted-text)] mt-1">{hint}</span>}
    </label>
  );
}

function Input({ value, onChange, ...props }) {
  return <input className="input-base" value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />;
}

function TextArea({ value, onChange, rows = 4, ...props }) {
  return <textarea className="input-base" rows={rows} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />;
}

function normaliseColour(value) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  if (/^#[0-9a-fA-F]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  return "";
}

function ColorInput({ value, onChange, allowAuto = false }) {
  const picker = normaliseColour(value) || "#000000";
  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] px-3 py-2">
          <input type="color" value={picker} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer bg-transparent" />
          <span className="h-8 w-8 border border-[var(--ff-card-border)]" style={{ backgroundColor: normaliseColour(value) || "transparent" }} />
        </div>
        <Input value={value} onChange={onChange} placeholder={allowAuto ? "Auto" : "#000000"} />
        {allowAuto && <button type="button" className="btn-secondary" onClick={() => onChange("")}>Auto</button>}
      </div>
      <div className="flex flex-wrap gap-1">
        {COLOUR_PRESETS.map((colour) => (
          <button key={colour} type="button" onClick={() => onChange(colour)} className="h-6 w-6 border border-[var(--ff-card-border)] hover:border-[var(--ff-primary)]" style={{ backgroundColor: colour }} aria-label={`Use ${colour}`} />
        ))}
      </div>
    </div>
  );
}

function ImageField({ label, value, onChange, subdir }) {
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("subdir", subdir);
      const response = await http.post("/files/image", body, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(response.data?.url || "");
      toast.success(`${label} uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.detail || `Could not upload ${label.toLowerCase()}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label={label}>
      <div className="space-y-2">
        {value && <div className="h-24 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-2 flex items-center justify-center"><img src={assetUrl(value)} alt={label} className="max-h-full max-w-full object-contain" /></div>}
        <div className="flex gap-2"><Input value={value} onChange={onChange} /><label className={`btn-secondary cursor-pointer ${uploading ? "opacity-60" : ""}`}><Upload size={14} /> {uploading ? "Uploading…" : "Upload"}<input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} /></label></div>
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

function createSection(type) {
  return normaliseSection({ id: uid(), type, title: `New ${SECTION_TYPES.find(([key]) => key === type)?.[1] || "section"}`, enabled: true }, 0);
}

function buildPayload(settings, sections) {
  return {
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
}

function BrandingEditor({ settings, patch }) {
  return (
    <div className="space-y-6">
      <section className="grid md:grid-cols-2 gap-4">
        <Field label="Platform name"><Input value={settings.platform_name} onChange={(value) => patch("platform_name", value)} /></Field>
        <Field label="Tagline"><Input value={settings.platform_tagline} onChange={(value) => patch("platform_tagline", value)} /></Field>
        <ImageField label="Logo" value={settings.logo_url} onChange={(value) => patch("logo_url", value)} subdir="branding/logo" />
        <ImageField label="Favicon" value={settings.favicon_url} onChange={(value) => patch("favicon_url", value)} subdir="branding/favicon" />
      </section>

      <section className="card space-y-4">
        <div><p className="overline mb-1">Instance identity</p><h3 className="font-display text-3xl uppercase">Business & Contact</h3></div>
        <div className="grid md:grid-cols-2 gap-4">
          {[["support_email", "Support email"], ["support_phone", "Support phone"], ["support_whatsapp", "Support WhatsApp"], ["business_name", "Business name"], ["business_registration", "Business registration"], ["public_contact_email", "Public contact email"], ["public_contact_phone", "Public contact phone"], ["country", "Country"], ["timezone", "Timezone"]].map(([key, label]) => <Field key={key} label={label}><Input value={settings[key]} onChange={(value) => patch(key, value)} /></Field>)}
        </div>
      </section>
    </div>
  );
}

function HomepageCopyEditor({ settings, patchNested }) {
  const home = settings.homepage || {};
  return <div className="grid md:grid-cols-2 gap-4">
    <Field label="Fallback hero title"><Input value={home.hero_title} onChange={(value) => patchNested("homepage", "hero_title", value)} /></Field>
    <Field label="Fallback hero subtitle"><TextArea value={home.hero_subtitle} onChange={(value) => patchNested("homepage", "hero_subtitle", value)} /></Field>
    {[["buyer_cta_label", "Buyer CTA label"], ["buyer_cta_url", "Buyer CTA URL"], ["creator_cta_label", "Creator CTA label"], ["creator_cta_url", "Creator CTA URL"], ["printer_cta_label", "Printer CTA label"], ["printer_cta_url", "Printer CTA URL"], ["featured_title", "Featured products title"], ["creators_title", "Creators title"]].map(([key, label]) => <Field key={key} label={label}><Input value={home[key]} onChange={(value) => patchNested("homepage", key, value)} /></Field>)}
  </div>;
}

function ListRows({ rows = [], fields, onChange }) {
  const update = (index, key, value) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  return <div className="space-y-3">{rows.map((row, index) => <div key={index} className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-3 space-y-2">{fields.map(([key, label]) => <Field key={key} label={label}><Input value={row[key]} onChange={(value) => update(index, key, value)} /></Field>)}<button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} className="text-xs uppercase tracking-widest text-[var(--ff-primary)]">Remove</button></div>)}</div>;
}

function HomepageBuilder({ sections, setSections }) {
  const [newType, setNewType] = useState("hero");
  const [expanded, setExpanded] = useState("");
  const updateSection = (id, patch) => setSections(sections.map((section) => section.id === id ? { ...section, ...patch } : section));
  const updateSetting = (id, key, value) => setSections(sections.map((section) => section.id === id ? { ...section, settings: { ...(section.settings || {}), [key]: value } } : section));
  const move = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= sections.length) return;
    const copy = [...sections];
    const [row] = copy.splice(index, 1);
    copy.splice(target, 0, row);
    setSections(copy);
  };

  return <div className="space-y-4">
    <section className="card flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div><p className="overline mb-1">Homepage Builder</p><h3 className="font-display text-3xl uppercase">Mongo-backed sections</h3><p className="text-sm text-[var(--ff-muted-text)] mt-1">Section order and content are saved in homepage_sections. No DOM lookup is used to add or select sections.</p></div>
      <div className="flex gap-2"><select className="input-base" value={newType} onChange={(event) => setNewType(event.target.value)}>{SECTION_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" className="btn-primary" onClick={() => { const next = createSection(newType); setSections([...sections, next]); setExpanded(next.id); }}><Plus size={14} /> Add</button></div>
    </section>

    {sections.map((section, index) => {
      const open = expanded === section.id;
      return <section key={section.id} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)]">
        <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div><p className="overline mb-1">{SECTION_TYPES.find(([key]) => key === section.type)?.[1] || section.type}{section.enabled === false ? " · Hidden" : ""}</p><h4 className="font-display text-2xl uppercase">{section.title || "Untitled section"}</h4></div>
          <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button><button type="button" className="btn-secondary" disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button><button type="button" className="btn-secondary" onClick={() => updateSection(section.id, { enabled: section.enabled === false })}>{section.enabled === false ? "Show" : "Hide"}</button><button type="button" className="btn-secondary" onClick={() => setSections([...sections, { ...section, id: uid(), title: `${section.title || "Section"} Copy` }])}><Copy size={14} /></button><button type="button" className="btn-secondary" onClick={() => setSections(sections.filter((row) => row.id !== section.id))}><Trash2 size={14} /></button><button type="button" className="btn-primary" onClick={() => setExpanded(open ? "" : section.id)}>{open ? "Close" : "Edit"}</button></div>
        </div>
        {open && <div className="border-t border-[var(--ff-card-border)] p-4 grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Section type"><select className="input-base" value={section.type} onChange={(event) => updateSection(section.id, { type: event.target.value })}>{SECTION_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
              {[["eyebrow", "Eyebrow"], ["title", "Title"], ["subtitle", "Subtitle"], ["button_label", "Button label"], ["button_url", "Button URL"], ["secondary_button_label", "Secondary button label"], ["secondary_button_url", "Secondary button URL"]].map(([key, label]) => <Field key={key} label={label}><Input value={section[key]} onChange={(value) => updateSection(section.id, { [key]: value })} /></Field>)}
              <ImageField label="Section image" value={section.image_url} onChange={(value) => updateSection(section.id, { image_url: value })} subdir="homepage/sections" />
            </div>
            <Field label="Content"><RichTextEditor value={section.body_html || ""} onChange={(value) => updateSection(section.id, { body_html: value })} /></Field>
            {section.type === "feature_grid" && <><div className="flex justify-between"><span className="label">Feature cards</span><button type="button" className="btn-secondary" onClick={() => updateSetting(section.id, "features", [...(section.settings?.features || []), { title: "", text: "" }])}>Add row</button></div><ListRows rows={section.settings?.features || []} fields={[["title", "Title"], ["text", "Text"]]} onChange={(rows) => updateSetting(section.id, "features", rows)} /></>}
            {section.type === "how_it_works" && <><div className="flex justify-between"><span className="label">Steps</span><button type="button" className="btn-secondary" onClick={() => updateSetting(section.id, "steps", [...(section.settings?.steps || []), { title: "", text: "" }])}>Add step</button></div><ListRows rows={section.settings?.steps || []} fields={[["title", "Title"], ["text", "Text"]]} onChange={(rows) => updateSetting(section.id, "steps", rows)} /></>}
            {section.type === "faq" && <><div className="flex justify-between"><span className="label">FAQs</span><button type="button" className="btn-secondary" onClick={() => updateSetting(section.id, "faqs", [...(section.settings?.faqs || []), { question: "", answer: "" }])}>Add FAQ</button></div><ListRows rows={section.settings?.faqs || []} fields={[["question", "Question"], ["answer", "Answer"]]} onChange={(rows) => updateSetting(section.id, "faqs", rows)} /></>}
            {["featured_products", "featured_creators"].includes(section.type) && <Field label="Display limit"><Input type="number" value={section.settings?.limit || ""} onChange={(value) => updateSetting(section.id, "limit", Number(value || 0))} /></Field>}
          </div>
          <div><p className="label">Preview</p><div className="card mt-2">{section.eyebrow && <p className="overline mb-2">{section.eyebrow}</p>}<h3 className="font-display text-3xl uppercase">{section.title || "Untitled"}</h3>{section.subtitle && <p className="text-sm text-[var(--ff-muted-text)] mt-2">{section.subtitle}</p>}<RichTextRenderer html={section.body_html || ""} className="mt-3 text-sm" /></div></div>
        </div>}
      </section>;
    })}
    {!sections.length && <div className="card text-[var(--ff-muted-text)]">No homepage sections yet.</div>}
  </div>;
}

function SignupEditor({ settings, patchNested, plans }) {
  const signup = settings.signup || {};
  const toggles = [["creator_signup_enabled", "Creator signup enabled"], ["printer_signup_enabled", "Printer signup enabled"], ["require_creator_approval", "Require creator approval"], ["require_printer_approval", "Require printer approval"], ["allow_manual_billing", "Allow manual billing"], ["allow_paystack_recurring_billing", "Allow Paystack recurring billing"]];
  return <div className="grid md:grid-cols-2 gap-4">{toggles.map(([key, label]) => <label key={key} className="card flex items-center justify-between gap-4"><span className="font-bold">{label}</span><input type="checkbox" checked={Boolean(signup[key])} onChange={(event) => patchNested("signup", key, event.target.checked)} /></label>)}<Field label="Default creator plan"><select className="input-base" value={signup.default_creator_plan_id || ""} onChange={(event) => patchNested("signup", "default_creator_plan_id", event.target.value)}><option value="">First active creator plan</option>{plans.creator.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field><Field label="Default printer plan"><select className="input-base" value={signup.default_printer_plan_id || ""} onChange={(event) => patchNested("signup", "default_printer_plan_id", event.target.value)}><option value="">First active printer plan</option>{plans.printer.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field></div>;
}

function LegalEditor({ settings, patchNested }) {
  return <div className="space-y-4">{POLICY_FIELDS.map(([key, label]) => <Field key={key} label={label}><RichTextEditor value={settings.policies?.[key] || ""} onChange={(value) => patchNested("policies", key, value)} /></Field>)}</div>;
}

const SECTION_TITLES = {
  branding: ["Brand & Theme", "Platform identity, colours and public contact information."],
  homepage: ["Homepage Copy", "Fallback homepage copy and public calls to action."],
  builder: ["Homepage Builder", "Section-based homepage content stored in Mongo."],
  signup: ["Signup", "Creator and printer signup behaviour and default plans."],
  legal: ["Legal", "Public policy and agreement content."],
};

export default function InstanceSettingsSectionPage({ section = "branding" }) {
  const activeSection = SECTION_TITLES[section] ? section : "branding";
  const [settings, setSettings] = useState(null);
  const [plans, setPlans] = useState({ creator: [], printer: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await http.get("/admin/instance-settings");
        if (mounted) setSettings(response.data || {});
        if (activeSection === "signup") {
          const [creator, printer] = await Promise.all([
            http.get("/admin/subscription-plans?audience=creator").catch(() => ({ data: [] })),
            http.get("/admin/subscription-plans?audience=printer").catch(() => ({ data: [] })),
          ]);
          if (mounted) setPlans({ creator: Array.isArray(creator.data) ? creator.data : [], printer: Array.isArray(printer.data) ? printer.data : [] });
        }
      } catch (error) {
        toast.error(error.response?.data?.detail || "Could not load instance settings");
      }
    };
    load();
    return () => { mounted = false; };
  }, [activeSection]);

  const sections = useMemo(() => (settings?.homepage_sections || []).map(normaliseSection).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)), [settings]);
  const patch = (key, value) => setSettings((current) => ({ ...(current || {}), [key]: value }));
  const patchNested = (group, key, value) => setSettings((current) => ({ ...(current || {}), [group]: { ...((current || {})[group] || {}), [key]: value } }));
  const setSections = (next) => patch("homepage_sections", next.map((row, index) => ({ ...normaliseSection(row, index), sort_order: (index + 1) * 10 })));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await http.patch("/admin/instance-settings", buildPayload(settings, sections));
      setSettings(response.data || settings);
      window.dispatchEvent(new CustomEvent("fandomforge:platform-updated", { detail: response.data || settings }));
      toast.success(`${SECTION_TITLES[activeSection][0]} saved`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="card text-[var(--ff-muted-text)]">Loading instance settings…</div>;

  return <div className="space-y-6" data-testid={`instance-settings-${activeSection}`}>
    <div className="card flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><p className="overline mb-2">Mongo-backed instance settings</p><h2 className="font-display text-3xl uppercase">{SECTION_TITLES[activeSection][0]}</h2><p className="text-sm text-[var(--ff-muted-text)] mt-1">{SECTION_TITLES[activeSection][1]}</p></div><button type="button" className="btn-primary" onClick={save} disabled={saving}><Save size={14} /> {saving ? "Saving…" : "Save Settings"}</button></div>
    {activeSection === "branding" && <BrandingEditor settings={settings} patch={patch} />}
    {activeSection === "homepage" && <HomepageCopyEditor settings={settings} patchNested={patchNested} />}
    {activeSection === "builder" && <HomepageBuilder sections={sections} setSections={setSections} />}
    {activeSection === "signup" && <SignupEditor settings={settings} patchNested={patchNested} plans={plans} />}
    {activeSection === "legal" && <LegalEditor settings={settings} patchNested={patchNested} />}
  </div>;
}
