import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { http, assetUrl } from "../lib/api";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";
import { saveLastCreatorStore } from "../lib/creatorStoreContext";

export default function BandStorefront() {
  const { slug } = useParams();
  const [creator, setBand] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    http.get(`/creators/slug/${slug}`)
      .then(async (r) => {
        setBand(r.data);
        const p = await http.get(`/creators/${r.data.id}/products`);
        setProducts(p.data);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (creator?.slug) {
      saveLastCreatorStore({ slug: creator.slug, name: creator.name });
    }
  }, [creator]);

  useEffect(() => {
    const selector = 'meta[name="robots"][data-creator-store="true"]';
    document.querySelector(selector)?.remove();

    const visibility = (creator?.visibility || "unlisted").toLowerCase();
    if (visibility === "public" && creator?.allow_search_indexing) return undefined;

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    meta.setAttribute("data-creator-store", "true");
    document.head.appendChild(meta);

    return () => document.querySelector(selector)?.remove();
  }, [creator]);

  if (loading) return (<div className="min-h-screen page-shell"><Navbar /><div className="pt-32 text-center overline">Loading…</div></div>);
  if (!creator) return (<div className="min-h-screen page-shell"><Navbar /><div className="pt-32 text-center overline">Creator not found</div></div>);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <div className="pt-16 relative" data-testid="creator-hero">
        <div className="relative h-[42vh] min-h-[260px] max-h-[340px] sm:h-[60vh] sm:min-h-[420px] sm:max-h-none overflow-hidden">
          {creator.banner_url && <img src={assetUrl(creator.banner_url)} alt={creator.name} className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 pb-6 sm:pb-12 w-full min-w-0">
              {creator.logo_url && <img src={assetUrl(creator.logo_url)} alt="" className="w-14 h-14 sm:w-20 sm:h-20 object-cover border border-[var(--ff-card-border)] mb-3 sm:mb-4" />}
              <div className="overline mb-2 flex flex-wrap gap-2 text-white/90"><Link to="/">FandomForge</Link><span>/</span><span>{creator.name}</span></div>
              <h1 className="font-display text-[clamp(2.1rem,11vw,4.75rem)] sm:text-7xl md:text-9xl uppercase leading-[0.92] sm:leading-[0.85] max-w-full" style={{ overflowWrap: "anywhere" }} data-testid="creator-name">{creator.name}</h1>
              <p className="text-white/90 text-sm sm:text-lg mt-3 sm:mt-4 max-w-2xl line-clamp-3" data-testid="creator-bio">{creator.bio}</p>
              {creator.socials && Object.keys(creator.socials).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-widest text-[var(--ff-muted-text)]" data-testid="creator-socials">
                  {Object.entries(creator.socials).map(([k, v]) => (
                    <span key={k}>{k}: @{v}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="py-10 sm:py-16 border-t border-[var(--ff-card-border)]" data-testid="creator-products-section">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <h2 className="font-display text-3xl sm:text-4xl uppercase mb-6 sm:mb-10">The Merch</h2>
          {products.length === 0 ? (
            <div className="overline text-[var(--ff-muted-text)]">No products yet.</div>
          ) : (
            <div className="grid grid-cols-1 xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {products.map((p) => <ProductCard key={p.id} product={p} bandSlug={creator.slug} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
