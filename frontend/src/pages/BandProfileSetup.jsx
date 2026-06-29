import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { http, assetUrl } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Upload } from "lucide-react";


const MAX_CREATOR_UPLOAD_MB = 25;
const MAX_CREATOR_UPLOAD_BYTES = MAX_CREATOR_UPLOAD_MB * 1024 * 1024;

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SetupImageUploadField({ label, value, onUpload, hint, requirements, inputId, previewClassName = "aspect-video" }) {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    if (file) onUpload(file);
    event.target.value = "";
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <label htmlFor={inputId} className="label">{label}</label>
          <p className="text-xs text-[var(--ff-muted-text)] mt-1">{hint}</p>
        </div>
      </div>

      <div className={`${previewClassName} border border-dashed border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] flex items-center justify-center overflow-hidden mb-4`}>
        {value ? (
          <img src={assetUrl(value)} alt={label} className="w-full h-full object-contain p-3" />
        ) : (
          <div className="text-center text-xs text-[var(--ff-muted-text)] uppercase tracking-widest px-4">No {label.toLowerCase()} uploaded yet</div>
        )}
      </div>

      <div className="space-y-3">
        <label className="btn-secondary cursor-pointer justify-center w-full">
          <Upload size={14} /> {value ? `Replace ${label}` : `Upload ${label}`}
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleChange}
          />
        </label>

        {selectedFile && (
          <div className="text-xs text-[var(--ff-muted-text)]">
            Selected: <span className="text-[var(--ff-card-text)]">{selectedFile.name}</span> · {formatFileSize(selectedFile.size)}
          </div>
        )}

        <div className="text-xs text-[var(--ff-muted-text)] leading-relaxed">
          {requirements}
          <br />
          Maximum upload size: {MAX_CREATOR_UPLOAD_MB}MB. Accepted: PNG, JPG, WebP or SVG.
        </div>
      </div>
    </div>
  );
}


export default function BandProfileSetup() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name || "", slug: "", bio: "",
    logo_url: "", banner_url: "",
    instagram: "", twitter: "",
  });
  const [loading, setLoading] = useState(false);
  const [hasBand, setHasBand] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState("");

  useEffect(() => {
    http.get("/creators/me").then((r) => { setHasBand(true); navigate("/creator"); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const uploadSetupImage = async (file, targetField) => {
    if (!file) return;

    if (file.size > MAX_CREATOR_UPLOAD_BYTES) {
      toast.error(`File too large. Maximum upload size is ${MAX_CREATOR_UPLOAD_MB}MB.`);
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("subdir", "creator-storefronts");

    setUploadingAsset(targetField);
    try {
      const response = await http.post("/files/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((current) => ({ ...current, [targetField]: response.data.url }));
      toast.success(targetField === "logo_url" ? "Logo uploaded" : "Banner uploaded");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Image upload failed");
    } finally {
      setUploadingAsset("");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!user) { navigate("/register?role=creator"); return; }
    setLoading(true);
    try {
      const socials = {};
      if (form.instagram) socials.instagram = form.instagram;
      if (form.twitter) socials.twitter = form.twitter;
      await http.post("/creators", {
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/\s+/g, "-"),
        bio: form.bio,
        logo_url: form.logo_url || null,
        banner_url: form.banner_url || null,
        socials,
      });
      await refreshUser();
      // Auto-activate subscription for MVP
      await http.post("/payments/subscribe").catch(() => {});
      toast.success("Creator profile created!");
      navigate("/creator");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create profile");
    } finally { setLoading(false); }
  };

  if (hasBand) return null;

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="max-w-2xl mx-auto px-6 md:px-10">
          <div className="overline mb-2">Creator Profile</div>
          <h1 className="font-display text-5xl uppercase mb-8">Set up your storefront</h1>
          <form onSubmit={submit} className="space-y-4" data-testid="creator-setup-form">
            <div><label className="label">Creator name</label><input className="input-base" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="creator-setup-name" /></div>
            <div><label className="label">URL slug (optional)</label><input className="input-base" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" data-testid="creator-setup-slug" /></div>
            <div><label className="label">Bio</label><textarea className="input-base" rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} data-testid="creator-setup-bio" /></div>
            <SetupImageUploadField
              label="Logo"
              value={form.logo_url}
              inputId="creator-setup-logo"
              hint={uploadingAsset === "logo_url" ? "Uploading logo…" : "Upload the store logo customers will see on your storefront."}
              requirements="Recommended: square or transparent logo, at least 800×800px."
              previewClassName="aspect-square"
              onUpload={(file) => uploadSetupImage(file, "logo_url")}
            />
            <SetupImageUploadField
              label="Banner"
              value={form.banner_url}
              inputId="creator-setup-banner"
              hint={uploadingAsset === "banner_url" ? "Uploading banner…" : "Upload a wide storefront banner or header image."}
              requirements="Recommended: wide banner, around 1600×600px or larger."
              previewClassName="aspect-[16/6]"
              onUpload={(file) => uploadSetupImage(file, "banner_url")}
            />
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Instagram</label><input className="input-base" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} data-testid="creator-setup-ig" /></div>
              <div><label className="label">Twitter</label><input className="input-base" value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} data-testid="creator-setup-tw" /></div>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="creator-setup-submit">
              {loading ? "Creating..." : "Create store"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
