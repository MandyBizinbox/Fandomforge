import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Store } from "lucide-react";
import { http, assetUrl } from "../lib/api";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";
import { saveLastCreatorStore } from "../lib/creatorStoreContext";

function socialUrl(name, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const username = raw.replace(/^@/, "");
  const key = String(name || "").toLowerCase();
  if (key.includes("facebook")) return `https://facebook.com/${username}`;
  if (key.includes("instagram")) return `https://instagram.com/${username}`;
  if (key.includes("tiktok")) return `https://tiktok.com/@${username}`;
  if (key.includes("youtube")) return `https://youtube.com/@${username}`;
  if (key.includes("x") || key.includes("twitter")) return `https://x.com/${username}`;
  return "";
}

async function loadCreatorByIdentifier(identifier) {
  try {
    const response = await http.get(`/creators/slug/${identifier}`);
    return response.data;
  } catch (requestError) {
    if (requestError.response?.status !== 404) throw requestError;

    const publicResponse = await http.get("/creators");
    const publicCreators = Array.isArray(publicResponse.data) ? publicResponse.data : [];
    const match = publicCreators.find((entry) => entry?.id === identifier || entry?.slug === identifier);

    if (!match) throw requestError;
    return match;
  }
}

export default function BandStorefront() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [creator, setCreator] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadStore() {
      setLoading(true);
      setError("");

      try {
        const loadedCreator = await loadCreatorByIdentifier(slug);
        if (!mounted) return;

        if (loadedCreator?.slug && loadedCreator.slug !== slug) {
          navigate(`/creators/${loadedCreator.slug}`, { replace: true });
          return;
        }

        setCreator(loadedCreator);

        const productResponse = await http.get(`/creators/${loadedCreator.id}/products`);
        if (!mounted) return;
        setProducts(Array.isArray(productResponse.data) ? productResponse.data : []);
      } catch (requestError) {
        if (!mounted) return;
        setCreator(null);
        setProducts([]);
        setError(requestError.response?.status === 404
          ? "This creator store could not be found or is not currently available."
          : requestError.response?.data?.detail || "This creator store could not be loaded.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadStore();

    return () => {
      mounted = false;
    };
  }, [navigate, slug]);

  useEffect(() => {
    if (creator?.slug) {
      saveLastCreatorStore({ slug: creator.slug, name: creator.name });
    }
  }, [creator]);

  useEffect(() => {
    const selector = 'meta[name="robots"][data-creator-store="true"]';
    document.querySelector(selector)?.remove();

    const visibility = String(creator?.visibility || "unlisted").toLowerCase();
    if (visibility === "public" && creator?.allow_search_indexing) return undefined;

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    meta.setAttribute("data-creator-store", "true");
    document.head.appendChild(meta);

    return () => document.querySelector(selector)?.remove();
  }, [creator]);

  if (loading) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <div className="pt-32 text-center overline">Loading creator store…</div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <main className="pt-32 pb-16 max-w-3xl mx-auto px-4 sm:px-6 md:px-10 text-center">
          <div className="card py-14">
            <Store className="mx-auto text-[var(--ff-primary)] mb-5" size={38} />
            <p className="overline mb-2">Creator store</p>
            <h1 className="font-display text-4xl sm:text-5xl uppercase mb-4">Store unavailable</h1>
            <p className="text-[var(--ff-muted-text)] mb-6">{error || "This creator store is not currently available."}</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Link to="/" className="btn-secondary">Return home</Link>
              <Link to="/contact" className="btn-primary">Contact Support</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const socialEntries = Object.entries(creator.socials || {}).filter(([, value]) => String(value || "").trim());

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <header className="pt-16 relative" data-testid="creator-hero">
        <div className="relative h-[42vh] min-h-[260px] max-h-[340px] sm:h-[60vh] sm:min-h-[420px] sm:max-h-none overflow-hidden bg-[var(--ff-surface-bg)]">
          {creator.banner_url ? (
            <img src={assetUrl(creator.banner_url)} alt={`${creator.name} store banner`} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"><Store size={80} className="text-[var(--ff-primary)] opacity-40" /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 pb-6 sm:pb-12 w-full min-w-0 text-white">
              {creator.logo_url && <img src={assetUrl(creator.logo_url)} alt={`${creator.name} logo`} className="w-14 h-14 sm:w-20 sm:h-20 object-contain bg-white border border-white/30 mb-3 sm:mb-4" />}
              <div className="overline mb-2 flex flex-wrap gap-2 text-white/90"><Link to="/">FandomForge</Link><span>/</span><span>{creator.name}</span></div>
              <h1 className="font-display text-[clamp(2.1rem,11vw,4.75rem)] sm:text-7xl md:text-9xl uppercase leading-[0.92] sm:leading-[0.85] max-w-full" style={{ overflowWrap: "anywhere" }} data-testid="creator-name">{creator.name}</h1>
              {creator.bio && <p className="text-white/90 text-sm sm:text-lg mt-3 sm:mt-4 max-w-2xl line-clamp-3" data-testid="creator-bio">{creator.bio}</p>}
              {socialEntries.length > 0 && (
                <nav className="mt-4 flex flex-wrap gap-3" aria-label={`${creator.name} social links`} data-testid="creator-socials">
                  {socialEntries.map(([name, value]) => {
                    const url = socialUrl(name, value);
                    if (!url) return <span key={name} className="text-xs uppercase tracking-widest text-white/80">{name}: {value}</span>;
                    return (
                      <a key={name} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-white/90 hover:text-white">
                        {name} <ExternalLink size={12} />
                      </a>
                    );
                  })}
                </nav>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="py-10 sm:py-16 border-t border-[var(--ff-card-border)]" data-testid="creator-products-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10">
          <h2 className="font-display text-3xl sm:text-4xl uppercase mb-6 sm:mb-10">Shop {creator.name}</h2>
          {products.length === 0 ? (
            <div className="card text-center py-12">
              <Store className="mx-auto text-[var(--ff-primary)] mb-4" />
              <h3 className="font-display text-3xl uppercase mb-2">No products available yet</h3>
              <p className="text-sm text-[var(--ff-muted-text)]">This store has not published any products for sale.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {products.map((product) => <ProductCard key={product.id} product={product} bandSlug={creator.slug || creator.id} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
