import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";

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

  useEffect(() => {
    http.get("/creators/me").then((r) => { setHasBand(true); navigate("/creator"); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <div><label className="label">Logo URL (optional)</label><input className="input-base" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} data-testid="creator-setup-logo" /></div>
            <div><label className="label">Banner URL (optional)</label><input className="input-base" value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} data-testid="creator-setup-banner" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Instagram</label><input className="input-base" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} data-testid="creator-setup-ig" /></div>
              <div><label className="label">Twitter</label><input className="input-base" value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} data-testid="creator-setup-tw" /></div>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="creator-setup-submit">
              {loading ? "Creating..." : "Create store & subscribe (Mock)"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
