import React, { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../lib/api";
import { DEFAULT_THEME_PALETTES, contrastRatio, mergeThemePalettes } from "../../lib/theme";

const PALETTE_FIELDS = [
  ["background_color", "Page background"],
  ["page_text_color", "Page text"],
  ["surface_background_color", "Surface background"],
  ["surface_text_color", "Surface text"],
  ["card_background_color", "Card background"],
  ["card_text_color", "Card text"],
  ["card_border_color", "Card border"],
  ["muted_text_color", "Muted text"],
  ["input_background_color", "Input background"],
  ["input_text_color", "Input text"],
  ["input_border_color", "Input border"],
  ["header_background_color", "Header / sidebar background"],
  ["header_text_color", "Header / sidebar text"],
  ["button_primary_background_color", "Primary button background"],
  ["button_primary_text_color", "Primary button text"],
  ["button_primary_border_color", "Primary button border"],
  ["button_alternate_background_color", "Secondary button background"],
  ["button_alternate_text_color", "Secondary button text"],
  ["button_alternate_border_color", "Secondary button border"],
  ["button_secondary_border_color", "Secondary idle border"],
];

const CONTRAST_PAIRS = [
  ["Page", "background_color", "page_text_color"],
  ["Surface", "surface_background_color", "surface_text_color"],
  ["Card", "card_background_color", "card_text_color"],
  ["Input", "input_background_color", "input_text_color"],
  ["Header / sidebar", "header_background_color", "header_text_color"],
  ["Primary button", "button_primary_background_color", "button_primary_text_color"],
  ["Secondary button", "button_alternate_background_color", "button_alternate_text_color"],
];

function normaliseHex(value, fallback = "#000000") {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  if (/^#[0-9a-fA-F]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  return fallback;
}

function Field({ label, hint, children }) {
  return <label className="ff-admin-field"><span className="ff-admin-label">{label}</span>{children}{hint && <span className="text-xs ff-admin-muted">{hint}</span>}</label>;
}

function ColourField({ label, value, fallback, onChange }) {
  const picker = normaliseHex(value, fallback);
  return <Field label={label}>
    <div className="grid grid-cols-[52px,1fr] gap-2 items-center">
      <input type="color" value={picker} onChange={(event) => onChange(event.target.value)} className="h-11 w-full cursor-pointer border border-[var(--ff-card-border)] bg-transparent" />
      <input className="input-base" value={value ?? ""} placeholder={fallback} onChange={(event) => onChange(event.target.value)} />
    </div>
  </Field>;
}

function ContrastBadge({ label, background, foreground }) {
  const ratio = contrastRatio(background, foreground);
  if (!ratio) return <div className="ff-admin-subpanel text-xs"><strong>{label}</strong><span className="block ff-admin-muted mt-1">Enter valid hex colours to check contrast.</span></div>;
  const level = ratio >= 4.5 ? "Good" : ratio >= 3 ? "Low" : "Poor";
  const className = ratio >= 4.5 ? "" : "ff-admin-danger-text";
  return <div className="ff-admin-subpanel text-xs"><div className="flex items-center justify-between gap-3"><strong>{label}</strong><span className={className}>{level} · {ratio.toFixed(2)}:1</span></div></div>;
}

function PaletteEditor({ mode, palette, primary, onPatch }) {
  const defaults = DEFAULT_THEME_PALETTES[mode];
  const resolved = useMemo(() => ({ ...defaults, ...palette }), [defaults, palette]);
  const primaryButtonBg = resolved.button_primary_background_color || primary;
  const alternateButtonBg = resolved.button_alternate_background_color || (mode === "light" ? "#111111" : "#FFFFFF");
  const contrastPalette = {
    ...resolved,
    button_primary_background_color: primaryButtonBg,
    button_alternate_background_color: alternateButtonBg,
  };

  return <div className="space-y-5">
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {PALETTE_FIELDS.map(([key, label]) => (
        <ColourField key={key} label={label} value={palette[key] ?? ""} fallback={defaults[key] || (key === "button_primary_background_color" ? primary : "#000000")} onChange={(value) => onPatch(key, value)} />
      ))}
    </div>
    <div>
      <p className="overline mb-2">Contrast checks</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {CONTRAST_PAIRS.map(([label, bgKey, textKey]) => <ContrastBadge key={label} label={label} background={contrastPalette[bgKey]} foreground={contrastPalette[textKey]} />)}
      </div>
      <p className="text-xs ff-admin-muted mt-2">4.5:1 or higher is the normal-text target. Low and poor combinations are warnings, not hard blocks.</p>
    </div>
  </div>;
}

export default function PlatformAppearanceSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [activePalette, setActivePalette] = useState("light");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    http.get("/admin/instance-settings")
      .then((response) => {
        if (!mounted) return;
        const value = response.data || {};
        setSettings({ ...value, theme_palettes: mergeThemePalettes(value.theme_palettes) });
      })
      .catch((error) => toast.error(error.response?.data?.detail || "Could not load Appearance settings"));
    return () => { mounted = false; };
  }, []);

  const patch = (key, value) => setSettings((current) => ({ ...(current || {}), [key]: value }));
  const patchPalette = (mode, key, value) => setSettings((current) => ({
    ...(current || {}),
    theme_palettes: {
      ...mergeThemePalettes(current?.theme_palettes),
      [mode]: { ...mergeThemePalettes(current?.theme_palettes)[mode], [key]: value },
    },
  }));

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const payload = {
        primary_color: settings.primary_color,
        accent_color: settings.accent_color,
        storefront_theme_mode: settings.storefront_theme_mode || "light",
        admin_theme_mode: settings.admin_theme_mode || "dark",
        allow_theme_toggle: Boolean(settings.allow_theme_toggle),
        theme_palettes: mergeThemePalettes(settings.theme_palettes),
      };
      const response = await http.patch("/admin/instance-settings", payload);
      const next = response.data || { ...settings, ...payload };
      setSettings({ ...next, theme_palettes: mergeThemePalettes(next.theme_palettes) });
      window.dispatchEvent(new CustomEvent("fandomforge:platform-updated", { detail: next }));
      toast.success("Appearance settings saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save Appearance settings");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="ff-admin-card"><p className="ff-admin-muted">Loading Appearance settings…</p></div>;

  const palettes = mergeThemePalettes(settings.theme_palettes);
  return <div className="space-y-6">
    <section className="ff-admin-card space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div><p className="overline mb-1">Theme ownership</p><h2 className="font-display text-3xl uppercase">Appearance</h2><p className="text-sm ff-admin-muted mt-2 max-w-3xl">Storefront and admin choose their own light, dark or system palette. Components consume semantic --ff-* tokens; pages should not own permanent colours.</p></div>
        <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}><Save size={14} /> {saving ? "Saving…" : "Save Appearance"}</button>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Field label="Storefront theme"><select className="input-base" value={settings.storefront_theme_mode || "light"} onChange={(event) => patch("storefront_theme_mode", event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></Field>
        <Field label="Admin theme"><select className="input-base" value={settings.admin_theme_mode || "dark"} onChange={(event) => patch("admin_theme_mode", event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></Field>
        <ColourField label="Primary brand colour" value={settings.primary_color || "#FF3B30"} fallback="#FF3B30" onChange={(value) => patch("primary_color", value)} />
        <ColourField label="Accent brand colour" value={settings.accent_color || "#FF7A1A"} fallback="#FF7A1A" onChange={(value) => patch("accent_color", value)} />
      </div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(settings.allow_theme_toggle)} onChange={(event) => patch("allow_theme_toggle", event.target.checked)} /><span>Allow a user theme override when a theme switcher is exposed</span></label>
    </section>

    <section className="ff-admin-card space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-3">
        {["light", "dark"].map((mode) => <button key={mode} type="button" className={`ff-admin-section-link ${activePalette === mode ? "is-active" : ""}`} onClick={() => setActivePalette(mode)}>{mode} palette</button>)}
      </div>
      <PaletteEditor mode={activePalette} palette={palettes[activePalette]} primary={settings.primary_color || "#FF3B30"} onPatch={(key, value) => patchPalette(activePalette, key, value)} />
    </section>
  </div>;
}
